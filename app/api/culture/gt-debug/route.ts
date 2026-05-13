/**
 * GET /api/culture/gt-debug
 *
 * Diagnostic: dump what's actually in culture_gt_snapshots by date.
 * Helps confirm whether snapshots are being written and which dates.
 */

import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export async function GET() {
  const totals = await sql().query(
    `SELECT snapshot_date::TEXT AS snapshot_date, COUNT(*) AS n,
            COUNT(DISTINCT geo) AS geos
       FROM culture_gt_snapshots
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
      LIMIT 7`,
  )

  const today = await sql().query(`SELECT CURRENT_DATE::TEXT AS d, NOW()::TEXT AS now`)

  const sample = await sql().query(
    `SELECT geo, snapshot_date::TEXT AS snapshot_date, rank, title
       FROM culture_gt_snapshots
      ORDER BY snapshot_date DESC, geo, rank
      LIMIT 10`,
  )

  return NextResponse.json({
    serverNow: today,
    perDate: totals,
    sample,
  })
}
