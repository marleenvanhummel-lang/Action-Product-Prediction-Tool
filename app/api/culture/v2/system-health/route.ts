/**
 * GET /api/culture/v2/system-health
 *
 * One-stop "is the system healthy" endpoint. Used by the dashboard
 * DataFreshnessBanner and the magazine footer to decide whether to
 * render warnings.
 *
 * Returns:
 *   - ageHours: age of the most recent successful scrape
 *   - stale: ageHours > 18
 *   - degraded: > 10% sources failed on the last run
 *   - lastRun: brief summary of the most recent fetch run
 *   - queueDepth: unprocessed scrape_results
 *   - sourceHealth: ok / total counts
 *   - reviewQueueCount: trends in `validate` state awaiting action
 *
 * Public read — no auth required.
 */
import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const dynamic = 'force-dynamic'

interface FetchRunRow {
  started_at: string
  finished_at: string | null
  sources_attempted: number | null
  sources_ok: number | null
  sources_failed: number | null
  trends_inserted: number | null
  status: string | null
}

export async function GET() {
  const [lastRun] = (await sql().query(
    `SELECT started_at::TEXT AS started_at,
            finished_at::TEXT AS finished_at,
            sources_attempted, sources_ok, sources_failed,
            trends_inserted, status
       FROM culture_fetch_runs
      ORDER BY started_at DESC LIMIT 1`,
  )) as FetchRunRow[]

  const ageMs = lastRun?.started_at
    ? Date.now() - new Date(lastRun.started_at).getTime()
    : null
  const ageHours = ageMs !== null ? Math.round(ageMs / 3_600_000) : null

  const stale = ageHours !== null && ageHours > 18
  const degraded =
    lastRun &&
    (lastRun.sources_attempted ?? 0) > 0 &&
    (lastRun.sources_failed ?? 0) / (lastRun.sources_attempted ?? 1) > 0.1

  const [queue] = (await sql().query(
    `SELECT COUNT(*) FILTER (WHERE processed_at IS NULL AND status = 'ok') AS queue
       FROM culture_scrape_results`,
  )) as Array<{ queue: string }>

  const [sourceHealth] = (await sql().query(
    `SELECT COUNT(*) FILTER (WHERE last_scrape_status = 'ok' AND active = true) AS ok,
            COUNT(*) FILTER (WHERE active = true) AS total
       FROM culture_sources`,
  )) as Array<{ ok: string; total: string }>

  const [reviewQueue] = (await sql().query(
    `SELECT COUNT(*) AS n
       FROM culture_trends
      WHERE status = 'active' AND decision_state = 'validate'`,
  )) as Array<{ n: string }>

  return NextResponse.json({
    ageHours,
    stale,
    degraded: Boolean(degraded),
    lastRun: lastRun
      ? {
          startedAt: lastRun.started_at,
          finishedAt: lastRun.finished_at,
          sourcesAttempted: Number(lastRun.sources_attempted ?? 0),
          sourcesOk: Number(lastRun.sources_ok ?? 0),
          sourcesFailed: Number(lastRun.sources_failed ?? 0),
          trendsInserted: Number(lastRun.trends_inserted ?? 0),
          status: lastRun.status,
        }
      : null,
    queueDepth: Number(queue?.queue ?? 0),
    sourceHealth: {
      ok: Number(sourceHealth?.ok ?? 0),
      total: Number(sourceHealth?.total ?? 0),
    },
    reviewQueueCount: Number(reviewQueue?.n ?? 0),
    computedAt: new Date().toISOString(),
  })
}
