/**
 * POST /api/culture/enrich-vibes
 *
 * Tags trends with a "vibe" — unhinged | aesthetic | humor | wholesome |
 * emotional | informational | product | sport.
 *
 * Body: { limit?: number, force?: boolean }
 *   limit = max trends to process this run (default 60, max 200)
 *   force = re-classify even trends that already have a vibe set
 *
 * First call also adds the column to the table — idempotent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { inferVibes, VIBES } from '@/lib/trend-vibe'

export const maxDuration = 300

interface Row {
  id: string
  name: string
  description: string
  category: string
  hashtags: string[] | null
}

const BATCH_SIZE = 12

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { limit?: number; force?: boolean } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch { /* empty */ }

  // Ensure column exists. Safe to run on every call.
  await sql().query(
    `ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS vibe TEXT`,
  )

  const limit = Math.min(200, Math.max(1, body.limit ?? 60))
  const filter = body.force ? '' : 'AND vibe IS NULL'

  const rows = (await sql().query(
    `SELECT id, name, description, category, hashtags
       FROM culture_trends
      WHERE status = 'active' ${filter}
      ORDER BY COALESCE(daily_rank, 999) ASC,
               COALESCE(weekly_rank, 999) ASC,
               popularity_score DESC
      LIMIT $1`,
    [limit],
  )) as Row[]

  let tagged = 0
  let unclassified = 0
  let failed = 0
  const counts: Record<string, number> = Object.fromEntries(VIBES.map((v) => [v, 0]))
  counts.null = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      const results = await inferVibes(
        batch.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          category: r.category,
          hashtags: r.hashtags ?? [],
        })),
      )

      for (const r of results) {
        const vibe = r.vibe
        counts[vibe ?? 'null'] = (counts[vibe ?? 'null'] ?? 0) + 1

        try {
          await sql().query(
            `UPDATE culture_trends SET vibe = $1, updated_at = NOW() WHERE id = $2`,
            [vibe, r.id],
          )
          if (vibe) tagged++
          else unclassified++
        } catch (err) {
          console.error('[enrich-vibes] db update failed for', r.id, err)
          failed++
        }
      }
    } catch (err) {
      console.error('[enrich-vibes] batch failed', err)
      failed += batch.length
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processed: rows.length,
    tagged,
    unclassified,
    failed,
    counts,
  })
}
