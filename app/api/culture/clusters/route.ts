/**
 * GET /api/culture/clusters
 *
 * Reads all active trends with embeddings, runs k-means clustering, and
 * returns the resulting clusters with their members. Used by the
 * dashboard "Emerging meta-clusters" section.
 *
 * Query params:
 *   k       = number of clusters (default 12)
 *   freshOnly = '1' to only cluster trends from last 14 days
 *
 * Caches result by date so we don't re-cluster on every page load.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { kMeansCluster } from '@/lib/trend-embeddings'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'
import { extractJson } from '@/lib/culture-radar'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

export const maxDuration = 60

interface Row {
  id: string
  name: string
  description: string
  embedding: number[]
  popularity_score: number
  growth_score: number | null
  subculture: string | null
  vibe: string | null
}

export async function GET(req: NextRequest) {
  const k = Math.min(30, Math.max(2, Number(req.nextUrl.searchParams.get('k') ?? 12)))
  const freshOnly = req.nextUrl.searchParams.get('freshOnly') === '1'

  // Ensure embedding column exists so the SELECT doesn't 500 on fresh DBs
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS embedding JSONB`)

  const freshFilter = freshOnly
    ? `AND first_seen_at >= NOW() - INTERVAL '14 days'`
    : ''

  const rows = (await sql().query(
    `SELECT id, name, description, embedding,
            popularity_score, growth_score, subculture, vibe
       FROM culture_trends
      WHERE status = 'active' AND embedding IS NOT NULL ${freshFilter}
      ORDER BY first_seen_at DESC
      LIMIT 800`,
  )) as Row[]

  if (rows.length < k) {
    return NextResponse.json({
      ok: true,
      message: `Only ${rows.length} embedded trends — need ${k}. Embed more first.`,
      clusters: [],
      embeddedTotal: rows.length,
    })
  }

  // Run k-means
  const vectors = rows.map((r) => ({ id: r.id, vector: r.embedding as number[] }))
  const clusters = kMeansCluster(vectors, k, 30)

  // Enrich each cluster with member info
  const byId = new Map(rows.map((r) => [r.id, r]))
  const enriched = clusters.map((c) => {
    const members = c.members.map((id) => byId.get(id)!).filter(Boolean)
    // Pick the trend closest to centroid as the "representative"
    const subcultureCounts: Record<string, number> = {}
    const vibeCounts: Record<string, number> = {}
    let avgPop = 0
    let avgGrowth = 0
    let growthN = 0
    for (const m of members) {
      if (m.subculture) subcultureCounts[m.subculture] = (subcultureCounts[m.subculture] ?? 0) + 1
      if (m.vibe) vibeCounts[m.vibe] = (vibeCounts[m.vibe] ?? 0) + 1
      avgPop += m.popularity_score
      if (m.growth_score != null) { avgGrowth += Number(m.growth_score); growthN++ }
    }
    avgPop /= Math.max(members.length, 1)
    avgGrowth = growthN > 0 ? avgGrowth / growthN : 0

    const dominantSubculture = Object.entries(subcultureCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    const dominantVibe = Object.entries(vibeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      size: members.length,
      avgPopularity: Math.round(avgPop * 10) / 10,
      avgGrowth: Math.round(avgGrowth * 10) / 10,
      dominantSubculture,
      dominantVibe,
      members: members.map((m) => ({ id: m.id, name: m.name, description: m.description.slice(0, 140) })),
    }
  })

  // Cache table for cluster labels (by date + cluster signature)
  await sql().query(`
    CREATE TABLE IF NOT EXISTS culture_cluster_labels (
      signature TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Generate labels via Gemini for each cluster (cached per signature)
  const labeled: typeof enriched & Array<{ label?: string; summary?: string }> = await Promise.all(
    enriched.map(async (c) => {
      const sig = clusterSignature(c.members.map((m) => m.name))
      const cached = (await sql().query(
        `SELECT label, summary FROM culture_cluster_labels WHERE signature = $1`,
        [sig],
      )) as Array<{ label: string; summary: string | null }>
      if (cached[0]) {
        return { ...c, label: cached[0].label, summary: cached[0].summary ?? '' }
      }
      const fresh = await labelCluster(c.members.map((m) => m.name + ' — ' + m.description))
      if (fresh) {
        await sql().query(
          `INSERT INTO culture_cluster_labels (signature, label, summary)
           VALUES ($1, $2, $3)
           ON CONFLICT (signature) DO NOTHING`,
          [sig, fresh.label, fresh.summary],
        )
      }
      return { ...c, label: fresh?.label ?? null, summary: fresh?.summary ?? null }
    }),
  ) as never

  return NextResponse.json({
    ok: true,
    k,
    embeddedTotal: rows.length,
    clusters: labeled,
  })
}

function clusterSignature(names: string[]): string {
  // Stable hash of sorted top-5 member names — same cluster → same key
  const sorted = [...names].sort().slice(0, 5).join('|').toLowerCase()
  // Simple djb2 hash for portability
  let hash = 5381
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash) + sorted.charCodeAt(i)
    hash = hash & hash
  }
  return `c${Math.abs(hash).toString(36)}`
}

async function labelCluster(memberDescriptions: string[]): Promise<{ label: string; summary: string } | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: CULTURE_GEMINI_MODEL,
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    })
    const prompt = `Below are 5-15 trending culture phenomena that an embedding algorithm grouped
into one cluster. Give the cluster a punchy 2-4 word label and a one-sentence
summary describing what they have in common.

Trends:
${memberDescriptions.slice(0, 12).map((m, i) => `${i + 1}. ${m}`).join('\n')}

Return JSON:
{
  "label": "2-4 word title (Title Case, no quotes)",
  "summary": "one sentence describing the common thread"
}`
    const result = await model.generateContent(prompt)
    const parsed = extractJson<{ label?: string; summary?: string }>(result.response.text())
    if (!parsed?.label) return null
    return {
      label: String(parsed.label).slice(0, 60),
      summary: String(parsed.summary ?? '').slice(0, 280),
    }
  } catch (err) {
    console.error('[clusters] label failed', err)
    return null
  }
}
