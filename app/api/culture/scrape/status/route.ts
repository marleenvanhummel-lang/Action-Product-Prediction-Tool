/**
 * GET /api/culture/scrape/status
 *
 * Returns live progress for a scrape job. UI polls this every 2-3s to
 * render the progress panel. State lives in the DB, so polling survives
 * page refresh, tab close, etc.
 *
 * Query:
 *   ?jobId=UUID   → status for a specific job
 *   ?latest=1     → status for the most recent job (any state)
 *   ?active=1     → most recent RUNNING job, or null if none
 *
 * Response shape:
 *   {
 *     job: {
 *       id, runId, status, startedAt, finishedAt, triggeredBy, kind,
 *       sourcesTotal, sourcesDone, sourcesOk, sourcesFailed,
 *       currentSourceName, error, elapsedMs
 *     },
 *     recentResults: [{ source_name, status, error, scraped_at }, ...]  // last 20
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const dynamic = 'force-dynamic'

interface JobRow {
  id: string
  run_id: string
  triggered_by: string | null
  status: string
  started_at: string
  finished_at: string | null
  sources_total: number
  sources_done: number
  sources_ok: number
  sources_failed: number
  current_source_name: string | null
  error: string | null
  kind: string | null
}

interface ResultRow {
  source_name: string
  status: string
  error: string | null
  scraped_at: string
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId')
  const wantActive = url.searchParams.get('active') === '1'
  const wantLatest = url.searchParams.get('latest') === '1'

  let job: JobRow | null = null

  if (jobId) {
    const rows = (await sql().query(
      `SELECT id, run_id, triggered_by, status, started_at::TEXT AS started_at,
              finished_at::TEXT AS finished_at, sources_total, sources_done,
              sources_ok, sources_failed, current_source_name, error, kind
         FROM culture_scrape_jobs
        WHERE id = $1`,
      [jobId],
    )) as JobRow[]
    job = rows[0] ?? null
  } else if (wantActive) {
    const rows = (await sql().query(
      `SELECT id, run_id, triggered_by, status, started_at::TEXT AS started_at,
              finished_at::TEXT AS finished_at, sources_total, sources_done,
              sources_ok, sources_failed, current_source_name, error, kind
         FROM culture_scrape_jobs
        WHERE status = 'running'
        ORDER BY started_at DESC
        LIMIT 1`,
    )) as JobRow[]
    job = rows[0] ?? null
  } else if (wantLatest) {
    const rows = (await sql().query(
      `SELECT id, run_id, triggered_by, status, started_at::TEXT AS started_at,
              finished_at::TEXT AS finished_at, sources_total, sources_done,
              sources_ok, sources_failed, current_source_name, error, kind
         FROM culture_scrape_jobs
        ORDER BY started_at DESC
        LIMIT 1`,
    )) as JobRow[]
    job = rows[0] ?? null
  } else {
    return NextResponse.json(
      { error: 'pass jobId, active=1, or latest=1' },
      { status: 400 },
    )
  }

  if (!job) {
    return NextResponse.json({ job: null, recentResults: [] })
  }

  // Pull last 20 per-source results for this run so the UI can show a
  // live scrolling log of what's completed.
  const results = (await sql().query(
    `SELECT source_name, status, error, scraped_at::TEXT AS scraped_at
       FROM culture_scrape_results
      WHERE run_id = $1
      ORDER BY scraped_at DESC
      LIMIT 30`,
    [job.run_id],
  )) as ResultRow[]

  const startedMs = new Date(job.started_at).getTime()
  const endMs = job.finished_at ? new Date(job.finished_at).getTime() : Date.now()

  return NextResponse.json({
    job: {
      id: job.id,
      runId: job.run_id,
      triggeredBy: job.triggered_by,
      status: job.status,
      kind: job.kind,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      sourcesTotal: job.sources_total,
      sourcesDone: job.sources_done,
      sourcesOk: job.sources_ok,
      sourcesFailed: job.sources_failed,
      currentSourceName: job.current_source_name,
      error: job.error,
      elapsedMs: Math.max(0, endMs - startedMs),
    },
    recentResults: results,
  })
}
