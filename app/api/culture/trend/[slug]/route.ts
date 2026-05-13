/**
 * GET /api/culture/trend/[slug]
 *
 * Full trend detail: row + snapshot timeseries + similar trends (via
 * embedding cosine similarity) + lifecycle data + verify verdict.
 *
 * Used by the /culture-radar/trends/[slug] page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, rowToTrend } from '@/lib/culture-db'
import { cosineSimilarity } from '@/lib/trend-embeddings'

export const maxDuration = 30

interface FullRow {
  id: string
  slug: string
  embedding: number[] | null
  lifecycle_stage: string | null
  lifecycle_data: unknown
  verify_verdict: string | null
}

interface SnapshotRow {
  snapshot_date: string
  popularity_score: number
  freshness_score: number
  validation_score: number
  growth_score: number | null
  daily_rank: number | null
  weekly_rank: number | null
}

interface SimRow {
  id: string
  name: string
  description: string
  embedding: number[]
  category: string
  subculture: string | null
  vibe: string | null
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  // Ensure derived columns exist on first call
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS embedding JSONB`)
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT`)
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS lifecycle_data JSONB`)
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS verify_verdict TEXT`)

  // Get the trend row + standard fields via rowToTrend
  const trendRows = (await sql().query(
    `SELECT * FROM culture_trends WHERE slug = $1 AND status != 'archived' LIMIT 1`,
    [slug],
  )) as Array<{ slug: string; embedding: number[] | null; lifecycle_stage: string | null; lifecycle_data: unknown; verify_verdict: string | null; [k: string]: unknown }>

  if (trendRows.length === 0) {
    return NextResponse.json({ error: 'not_found', slug }, { status: 404 })
  }

  const raw = trendRows[0] as unknown as Parameters<typeof rowToTrend>[0]
  const trend = rowToTrend(raw)
  const meta: FullRow = {
    id: trend.id,
    slug: trendRows[0].slug,
    embedding: trendRows[0].embedding ?? null,
    lifecycle_stage: trendRows[0].lifecycle_stage ?? null,
    lifecycle_data: trendRows[0].lifecycle_data ?? null,
    verify_verdict: trendRows[0].verify_verdict ?? null,
  }

  // Snapshots
  const snapshots = (await sql().query(
    `SELECT snapshot_date::TEXT AS snapshot_date, popularity_score, freshness_score,
            validation_score, growth_score, daily_rank, weekly_rank
       FROM culture_trend_snapshots
      WHERE trend_id = $1
      ORDER BY snapshot_date ASC
      LIMIT 90`,
    [trend.id],
  )) as SnapshotRow[]

  // Similar trends via embedding cosine
  let similar: Array<{ id: string; slug: string; name: string; description: string; similarity: number; category: string; subculture: string | null; vibe: string | null }> = []
  if (meta.embedding && meta.embedding.length > 0) {
    const others = (await sql().query(
      `SELECT id, name, slug, description, embedding, category, subculture, vibe
         FROM culture_trends
        WHERE status = 'active'
          AND embedding IS NOT NULL
          AND id != $1
        LIMIT 500`,
      [trend.id],
    )) as Array<SimRow & { slug: string }>

    const scored = others.map((o) => ({
      ...o,
      similarity: cosineSimilarity(meta.embedding!, o.embedding),
    }))
    scored.sort((a, b) => b.similarity - a.similarity)
    similar = scored.slice(0, 8).map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description.slice(0, 140),
      similarity: Math.round(s.similarity * 1000) / 1000,
      category: s.category,
      subculture: s.subculture,
      vibe: s.vibe,
    }))
  }

  return NextResponse.json({
    ok: true,
    trend,
    snapshots: snapshots.map((s) => ({
      ...s,
      growth_score: s.growth_score == null ? null : Number(s.growth_score),
    })),
    similar,
    lifecycle: meta.lifecycle_data,
    lifecycleStage: meta.lifecycle_stage,
    verifyVerdict: meta.verify_verdict,
  })
}
