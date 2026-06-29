/**
 * POST /api/culture/scrape
 *
 * Stage 1 of the fetch pipeline (split from monolithic /fetch which
 * regularly exceeded the 300s budget). This endpoint ONLY scrapes
 * sources and stores the raw content in `culture_scrape_results`.
 * No Gemini, no AI, no ranking.
 *
 * /api/culture/extract drains the queue afterwards.
 *
 * Body: { limit?: number, sourceIds?: number[], lookbackDays?: number }
 *   limit  = optional cap (default: scrape all active)
 *   sourceIds = scrape only these
 *   lookbackDays = pass through to scrape (some sources widen by date)
 *
 * Idempotent: re-running drops + re-inserts results for the same
 * (run_id, source_id) — but each call creates a new run_id.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql, listSources, createFetchRun, updateSourceScrapeStatus } from '@/lib/culture-db'
import type { SourceRow } from '@/app/api/culture/fetch/route'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'

// Re-export the scrapeSource function from the legacy /fetch route
// to avoid duplicating the dispatch logic.
import { scrapeSource as _scrapeSource } from '@/app/api/culture/fetch/route'

export const maxDuration = 300

const SCRAPE_CONCURRENCY = 8

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { limit?: number; sourceIds?: number[]; lookbackDays?: number; triggeredBy?: string } = {}
  try { body = await req.json().catch(() => ({})) } catch { /* */ }

  // Ensure table
  await sql().query(`
    CREATE TABLE IF NOT EXISTS culture_scrape_results (
      id BIGSERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      source_category TEXT NOT NULL,
      url TEXT NOT NULL,
      scraped_at TIMESTAMPTZ DEFAULT NOW(),
      text_snippet TEXT NOT NULL,
      top_links JSONB,
      status TEXT NOT NULL,
      error TEXT,
      processed_at TIMESTAMPTZ
    )
  `)
  await sql().query(`
    CREATE INDEX IF NOT EXISTS idx_scrape_unprocessed
      ON culture_scrape_results (processed_at) WHERE processed_at IS NULL
  `)

  // Load sources
  const rows = await listSources({ activeOnly: true, ids: body.sourceIds })
  let sources = rows as unknown as SourceRow[]
  // Exclude sources that belong to other pipelines or have no real URL.
  // perplexity_moment_query is for /api/moments/fetch (forward-looking
  // calendar events), not culture trends. 'manual' is the placeholder
  // for human-submitted entries. Scraping either with Firecrawl just
  // produces a 'Bad Request' because the URL is a pseudo internal one.
  // Skip these unless the caller explicitly requested them via sourceIds.
  if (!body.sourceIds || body.sourceIds.length === 0) {
    sources = sources.filter(
      (s) => s.source_type !== 'perplexity_moment_query' && s.source_type !== 'manual',
    )
  }
  if (body.limit) sources = sources.slice(0, body.limit)
  if (sources.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sources matched filters', scraped: 0 })
  }

  const runId = await createFetchRun({
    triggeredBy: body.triggeredBy ?? 'scrape-only',
    sourcesAttempted: sources.length,
    aiModel: CULTURE_GEMINI_MODEL,
  })

  // Create a job row so the UI can poll for live progress. Survives
  // page refresh — the UI reads /api/culture/scrape/status?jobId=X.
  const jobRows = (await sql().query(
    `INSERT INTO culture_scrape_jobs
       (run_id, triggered_by, status, sources_total, kind)
     VALUES ($1, $2, 'running', $3, 'scrape')
     RETURNING id`,
    [runId, body.triggeredBy ?? 'scrape-only', sources.length],
  )) as Array<{ id: string }>
  const jobId = jobRows[0].id

  const lookbackDays = Math.max(0, Math.min(30, body.lookbackDays ?? 0))

  // Run scrapes
  const results: Array<{ sourceId: number; ok: boolean; error?: string }> = []
  let ok = 0
  let failed = 0
  let cursor = 0

  try {
    await Promise.all(
      Array.from({ length: Math.min(SCRAPE_CONCURRENCY, sources.length) }, async () => {
        while (cursor < sources.length) {
          const i = cursor++
          const s = sources[i]
          // Mark this source as the current focus (best-effort; with
          // concurrency 8 'current' is approximate but still useful)
          sql().query(
            `UPDATE culture_scrape_jobs
                SET current_source_name = $1
              WHERE id = $2`,
            [s.name, jobId],
          ).catch(() => {})
          try {
            const r = await _scrapeSource(s, lookbackDays)
            // Store result
            await sql().query(
              `INSERT INTO culture_scrape_results
                 (run_id, source_id, source_name, source_category, url,
                  text_snippet, top_links, status, error)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
              [
                runId, s.id, s.name, s.category, r.url,
                r.textSnippet ?? '',
                JSON.stringify(r.topLinks ?? []),
                r.ok ? 'ok' : 'error',
                r.error ?? null,
              ],
            )
            await updateSourceScrapeStatus({
              id: s.id,
              fetchedAt: r.fetchedAt,
              status: r.ok ? 'ok' : 'error',
              error: r.error ?? null,
            })
            if (r.ok) ok++
            else failed++
            results.push({ sourceId: s.id, ok: r.ok, error: r.error })
          } catch (err) {
            failed++
            results.push({ sourceId: s.id, ok: false, error: err instanceof Error ? err.message : String(err) })
          }
          // Update progress counters after each source completes
          await sql().query(
            `UPDATE culture_scrape_jobs
                SET sources_done = $1, sources_ok = $2, sources_failed = $3
              WHERE id = $4`,
            [ok + failed, ok, failed, jobId],
          ).catch(() => {})
        }
      }),
    )

    // Mark job done
    await sql().query(
      `UPDATE culture_scrape_jobs
          SET status = 'done',
              finished_at = NOW(),
              sources_done = $1, sources_ok = $2, sources_failed = $3,
              current_source_name = NULL
        WHERE id = $4`,
      [ok + failed, ok, failed, jobId],
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await sql().query(
      `UPDATE culture_scrape_jobs
          SET status = 'failed', finished_at = NOW(), error = $1
        WHERE id = $2`,
      [message, jobId],
    ).catch(() => {})
    // Return a structured 500 instead of re-throwing. A bare `throw` here
    // surfaces as an empty-body platform 500 that hides the real cause
    // (e.g. "project size limit exceeded" when the database is full),
    // which is exactly what masked the June 2026 outage. Callers and the
    // GHA cron can now read the error and the partial counts.
    return NextResponse.json(
      {
        ok: false,
        runId,
        jobId,
        error: message,
        durationMs: Date.now() - started,
        scraped: ok + failed,
        okCount: ok,
        failedCount: failed,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    runId,
    jobId,
    durationMs: Date.now() - started,
    scraped: ok + failed,
    okCount: ok,
    failedCount: failed,
    message: `Scraped ${ok + failed} sources, ${ok} ok, ${failed} failed. Call /api/culture/extract to process.`,
  })
}
