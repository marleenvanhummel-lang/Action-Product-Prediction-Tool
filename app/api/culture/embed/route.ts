/**
 * POST /api/culture/embed
 *
 * Generates Gemini text embeddings for active trends that don't yet have
 * one. Stored as JSONB float arrays in culture_trends.embedding.
 *
 * Body: { limit?: number, force?: boolean }
 *   limit  = max trends to embed this run (default 60, max 200)
 *   force  = re-embed trends that already have one
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { embedTrend } from '@/lib/trend-embeddings'

export const maxDuration = 300

interface Row {
  id: string
  name: string
  description: string
  hashtags: string[] | null
  subculture: string | null
  vibe: string | null
}

const CONCURRENCY = 8  // Gemini embedding is fast + cheap

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { limit?: number; force?: boolean } = {}
  try { body = await req.json().catch(() => ({})) } catch { /* */ }

  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS embedding JSONB`)

  const limit = Math.min(200, Math.max(1, body.limit ?? 60))
  const filter = body.force ? '' : 'AND embedding IS NULL'

  const rows = (await sql().query(
    `SELECT id, name, description, hashtags, subculture, vibe
       FROM culture_trends
      WHERE status = 'active' ${filter}
      ORDER BY first_seen_at DESC
      LIMIT $1`,
    [limit],
  )) as Row[]

  let embedded = 0
  let failed = 0
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      while (cursor < rows.length) {
        const i = cursor++
        const r = rows[i]
        try {
          const vec = await embedTrend({
            id: r.id,
            name: r.name,
            description: r.description,
            hashtags: r.hashtags ?? [],
            subculture: r.subculture,
            vibe: r.vibe,
          })
          if (!vec) { failed++; continue }
          await sql().query(
            `UPDATE culture_trends SET embedding = $1::jsonb WHERE id = $2`,
            [JSON.stringify(vec), r.id],
          )
          embedded++
        } catch (err) {
          console.error('[embed] row failed', r.id, err)
          failed++
        }
      }
    }),
  )

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processed: rows.length,
    embedded,
    failed,
  })
}
