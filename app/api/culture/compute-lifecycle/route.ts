/**
 * POST /api/culture/compute-lifecycle
 *
 * For every active trend, fetch its snapshots from culture_trend_snapshots,
 * compute lifecycle stage via lib/trend-lifecycle, store back on the trend
 * row.
 *
 * Pure derivation, cheap (no AI). Cron step after snapshot.
 *
 * Adds two columns on first call: lifecycle_stage, lifecycle_data (jsonb).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { detectLifecycleStage } from '@/lib/trend-lifecycle'

export const maxDuration = 60

interface TrendRow {
  id: string
  first_seen_at: string | null
}

interface SnapRow {
  trend_id: string
  snapshot_date: string
  popularity_score: number
}

export async function POST(_req: NextRequest) {
  const started = Date.now()

  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT`)
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS lifecycle_data JSONB`)

  const trends = (await sql().query(
    `SELECT id, first_seen_at::TEXT AS first_seen_at
       FROM culture_trends
      WHERE status = 'active'`,
  )) as TrendRow[]

  if (trends.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No active trends' })
  }

  // Pull all snapshots for these trends in one query
  const trendIds = trends.map((t) => t.id)
  const snaps = (await sql().query(
    `SELECT trend_id, snapshot_date::TEXT AS snapshot_date, popularity_score
       FROM culture_trend_snapshots
      WHERE trend_id = ANY($1::uuid[])
      ORDER BY trend_id, snapshot_date ASC`,
    [trendIds],
  )) as SnapRow[]

  // Group by trend_id
  const byTrend = new Map<string, Array<{ date: string; popularity: number }>>()
  for (const s of snaps) {
    const list = byTrend.get(s.trend_id) ?? []
    list.push({ date: s.snapshot_date, popularity: s.popularity_score })
    byTrend.set(s.trend_id, list)
  }

  let updated = 0
  const stageCounts: Record<string, number> = {
    emerging: 0, climbing: 0, peak: 0, declining: 0, dormant: 0,
  }

  for (const t of trends) {
    const result = detectLifecycleStage({
      firstSeenAt: t.first_seen_at,
      snapshots: byTrend.get(t.id) ?? [],
    })
    stageCounts[result.stage] = (stageCounts[result.stage] ?? 0) + 1
    await sql().query(
      `UPDATE culture_trends SET lifecycle_stage = $1, lifecycle_data = $2::jsonb WHERE id = $3`,
      [result.stage, JSON.stringify(result), t.id],
    )
    updated++
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processed: trends.length,
    updated,
    stageCounts,
  })
}
