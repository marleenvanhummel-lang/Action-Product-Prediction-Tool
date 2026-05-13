/**
 * POST /api/culture/snapshot-trends
 *
 * Captures a nightly snapshot of every active trend's key metrics:
 * popularity_score, freshness_score, validation_score, growth_score,
 * daily_rank, weekly_rank. Stored in culture_trend_snapshots, one row
 * per trend per day.
 *
 * Lets us draw 7-day velocity sparklines on the dashboard and feed a
 * smarter growth predictor in v2.1 (delta-based, not just point-in-time).
 *
 * Idempotent: re-running on the same day UPSERTs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 120

interface TrendRow {
  id: string
  popularity_score: number
  freshness_score: number
  validation_score: number
  growth_score: number | null
  daily_rank: number | null
  weekly_rank: number | null
}

export async function POST(_req: NextRequest) {
  const started = Date.now()

  // Ensure the snapshot table exists. Compact schema, append-only.
  await sql().query(`
    CREATE TABLE IF NOT EXISTS culture_trend_snapshots (
      trend_id UUID NOT NULL,
      snapshot_date DATE NOT NULL,
      popularity_score INTEGER,
      freshness_score INTEGER,
      validation_score INTEGER,
      growth_score NUMERIC(3,1),
      daily_rank INTEGER,
      weekly_rank INTEGER,
      PRIMARY KEY (trend_id, snapshot_date)
    )
  `)
  await sql().query(`
    CREATE INDEX IF NOT EXISTS idx_snap_trend_date
      ON culture_trend_snapshots (trend_id, snapshot_date DESC)
  `)

  const rows = (await sql().query(
    `SELECT id, popularity_score, freshness_score, validation_score,
            growth_score, daily_rank, weekly_rank
       FROM culture_trends
      WHERE status = 'active'`,
  )) as TrendRow[]

  let inserted = 0
  for (const r of rows) {
    await sql().query(
      `INSERT INTO culture_trend_snapshots
         (trend_id, snapshot_date, popularity_score, freshness_score,
          validation_score, growth_score, daily_rank, weekly_rank)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (trend_id, snapshot_date) DO UPDATE SET
         popularity_score = EXCLUDED.popularity_score,
         freshness_score = EXCLUDED.freshness_score,
         validation_score = EXCLUDED.validation_score,
         growth_score = EXCLUDED.growth_score,
         daily_rank = EXCLUDED.daily_rank,
         weekly_rank = EXCLUDED.weekly_rank`,
      [r.id, r.popularity_score, r.freshness_score, r.validation_score,
       r.growth_score, r.daily_rank, r.weekly_rank],
    )
    inserted++
  }

  // Garbage collect old snapshots — keep 90 days per trend.
  await sql().query(`
    DELETE FROM culture_trend_snapshots
     WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
  `)

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    inserted,
  })
}
