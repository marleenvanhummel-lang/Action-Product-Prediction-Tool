/**
 * GET /api/culture/sources
 *
 * Returns the catalogue of trend sources, with last-scrape status per source.
 *
 * Query params:
 *   active=1   → only sources with active=true
 *   category=  → filter by category
 *
 * Storage: Neon / Vercel Postgres.
 */

import { NextResponse } from 'next/server'
import { listSources, rowToSource } from '@/lib/culture-db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const onlyActive = searchParams.get('active') === '1'
  const category = searchParams.get('category')

  try {
    const rows = await listSources({ activeOnly: onlyActive, category: category ?? undefined })
    return NextResponse.json({
      count: rows.length,
      sources: rows.map(rowToSource),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), sources: [] },
      { status: 500 },
    )
  }
}
