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

  return NextResponse.json({
    ok: true,
    k,
    embeddedTotal: rows.length,
    clusters: enriched,
  })
}
