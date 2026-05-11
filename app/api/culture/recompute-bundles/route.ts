/**
 * POST /api/culture/recompute-bundles
 *
 * Walks all active trends in the current week and assigns a bundle_key
 * via lib/trend-bundles.computeBundleKey. Trends with the same bundle_key
 * are shown as one card in the UI (the highest-popularity one becomes
 * the primary, the others become variants).
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { computeBundleKey } from '@/lib/trend-bundles'
import { isoWeek } from '@/lib/culture-radar'

export const maxDuration = 60

interface Row {
  id: string
  name: string
  hashtags: string[] | null
}

export async function POST(req: NextRequest) {
  let body: { week?: string } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    /* empty */
  }
  const week = body.week ?? isoWeek()

  const rows = (await sql().query(
    `SELECT id, name, hashtags
       FROM culture_trends
      WHERE status = 'active' AND rank_week = $1`,
    [week],
  )) as Row[]

  let updated = 0
  for (const r of rows) {
    const key = computeBundleKey(r.name, r.hashtags ?? [])
    if (key) {
      await sql().query(
        `UPDATE culture_trends SET bundle_key = $1 WHERE id = $2`,
        [key, r.id],
      )
      updated++
    }
  }

  // Show bundles that have multiple members
  const bundles = (await sql().query(
    `SELECT bundle_key, COUNT(*) AS n, array_agg(name ORDER BY popularity_score DESC) AS members
       FROM culture_trends
      WHERE status = 'active' AND rank_week = $1 AND bundle_key IS NOT NULL
      GROUP BY bundle_key
      HAVING COUNT(*) >= 2
      ORDER BY n DESC
      LIMIT 30`,
    [week],
  )) as Array<{ bundle_key: string; n: string; members: string[] }>

  return NextResponse.json({
    ok: true,
    week,
    processed: rows.length,
    updated,
    bundles: bundles.map((b) => ({ key: b.bundle_key, count: Number(b.n), members: b.members })),
  })
}
