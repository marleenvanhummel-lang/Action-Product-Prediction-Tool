/**
 * POST /api/culture/enrich-subcultures
 *
 * Tags trends with the subculture / niche / community they live in.
 * 33-entry fixed taxonomy. Auto-adds the column on first run.
 *
 * Body: { limit?: number, force?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { inferSubcultures, SUBCULTURES } from '@/lib/trend-subculture'

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

  await sql().query(
    `ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS subculture TEXT`,
  )

  const limit = Math.min(200, Math.max(1, body.limit ?? 60))
  const filter = body.force ? '' : 'AND subculture IS NULL'

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
  const counts: Record<string, number> = Object.fromEntries(SUBCULTURES.map((s) => [s, 0]))
  counts.null = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      const results = await inferSubcultures(
        batch.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          category: r.category,
          hashtags: r.hashtags ?? [],
        })),
      )

      for (const r of results) {
        const sub = r.subculture
        counts[sub ?? 'null'] = (counts[sub ?? 'null'] ?? 0) + 1
        try {
          await sql().query(
            `UPDATE culture_trends SET subculture = $1, updated_at = NOW() WHERE id = $2`,
            [sub, r.id],
          )
          if (sub) tagged++
          else unclassified++
        } catch (err) {
          console.error('[enrich-subcultures] db update failed for', r.id, err)
          failed++
        }
      }
    } catch (err) {
      console.error('[enrich-subcultures] batch failed', err)
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
