/**
 * POST /api/culture/verify-trends
 *
 * Hallucination filter for newly-extracted trends. Targets single-source
 * trends that haven't been cross-validated. Batched Gemini call decides
 * if each trend is real / generic / fabricated / uncertain.
 *
 * Actions taken:
 *   - "fabricated" → status = 'archived' (drops out of dashboard)
 *   - "generic"    → keep visible BUT flagged in DB (so we can hide later
 *                    or weight down in ranking)
 *   - "real"       → keep, mark verified
 *   - "uncertain"  → leave alone
 *
 * Body: { limit?: number, force?: boolean }
 *   limit = max trends to verify this run (default 60)
 *   force = re-verify trends already marked verified
 *
 * Adds two columns on first run: verified_at TIMESTAMPTZ, verify_verdict TEXT.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { verifyTrends } from '@/lib/trend-verify'

export const maxDuration = 300

interface Row {
  id: string
  name: string
  description: string
  hashtags: string[] | null
  source_names: string[] | null
}

const BATCH_SIZE = 12

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { limit?: number; force?: boolean } = {}
  try { body = await req.json().catch(() => ({})) } catch { /* */ }

  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`)
  await sql().query(`ALTER TABLE culture_trends ADD COLUMN IF NOT EXISTS verify_verdict TEXT`)

  const limit = Math.min(200, Math.max(1, body.limit ?? 60))
  const filter = body.force ? '' : 'AND verified_at IS NULL'

  // Target single-source trends first (highest hallucination risk).
  // Then untouched multi-source. Process newest first.
  const rows = (await sql().query(
    `SELECT id, name, description, hashtags, source_names
       FROM culture_trends
      WHERE status = 'active' ${filter}
      ORDER BY validation_score ASC, first_seen_at DESC
      LIMIT $1`,
    [limit],
  )) as Row[]

  let verified = 0
  let archived = 0
  let failed = 0
  const verdicts: Record<string, number> = { real: 0, generic: 0, fabricated: 0, uncertain: 0 }
  const archivedExamples: string[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    try {
      const results = await verifyTrends(
        batch.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          hashtags: r.hashtags ?? [],
          sourceName: (r.source_names ?? [])[0] ?? 'unknown',
        })),
      )
      for (const r of results) {
        verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1
        try {
          if (r.verdict === 'fabricated') {
            await sql().query(
              `UPDATE culture_trends
                  SET status = 'archived', verified_at = NOW(), verify_verdict = $1
                WHERE id = $2`,
              [r.verdict, r.id],
            )
            archived++
            const trend = batch.find((t) => t.id === r.id)
            if (trend) archivedExamples.push(trend.name)
          } else {
            await sql().query(
              `UPDATE culture_trends
                  SET verified_at = NOW(), verify_verdict = $1
                WHERE id = $2`,
              [r.verdict, r.id],
            )
            verified++
          }
        } catch (err) {
          console.error('[verify-trends] db update failed', r.id, err)
          failed++
        }
      }
    } catch (err) {
      console.error('[verify-trends] batch failed', err)
      failed += batch.length
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processed: rows.length,
    verified,
    archived,
    failed,
    verdicts,
    archivedExamples: archivedExamples.slice(0, 10),
  })
}
