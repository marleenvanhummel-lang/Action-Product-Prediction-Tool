/**
 * GET /api/culture/source-health
 *
 * Per source: how reliable is the data it produces? Aggregates the
 * verify_verdict of every trend that lists this source in source_names.
 *
 * Output per source: real / generic / fabricated / uncertain counts +
 * health_score (% real) + last_scraped_at + last_scrape_status.
 *
 * Lets us auto-demote noisy sources and surface "best sources" leaderboard.
 */

import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 30

interface Row {
  source_name: string
  source_id: number | null
  real: number
  generic: number
  fabricated: number
  uncertain: number
  unverified: number
  total: number
  last_scraped_at: string | null
  last_scrape_status: string | null
  reliability: number | null
}

export async function GET() {
  // Pull verify counts per source. Note: a trend can have multiple sources;
  // we explode source_names and attribute each verdict to every source.
  const rows = (await sql().query(
    `WITH explode AS (
       SELECT unnest(source_names) AS source_name, verify_verdict
         FROM culture_trends
        WHERE status != 'archived' OR verify_verdict = 'fabricated'
     )
     SELECT
       e.source_name,
       SUM(CASE WHEN e.verify_verdict = 'real'        THEN 1 ELSE 0 END)::int AS real,
       SUM(CASE WHEN e.verify_verdict = 'generic'     THEN 1 ELSE 0 END)::int AS generic,
       SUM(CASE WHEN e.verify_verdict = 'fabricated'  THEN 1 ELSE 0 END)::int AS fabricated,
       SUM(CASE WHEN e.verify_verdict = 'uncertain'   THEN 1 ELSE 0 END)::int AS uncertain,
       SUM(CASE WHEN e.verify_verdict IS NULL         THEN 1 ELSE 0 END)::int AS unverified,
       COUNT(*)::int AS total,
       s.last_scraped_at::TEXT AS last_scraped_at,
       s.last_scrape_status,
       s.reliability,
       s.id AS source_id
       FROM explode e
       LEFT JOIN culture_sources s ON s.name = e.source_name
      GROUP BY e.source_name, s.last_scraped_at, s.last_scrape_status, s.reliability, s.id
     HAVING COUNT(*) >= 3
      ORDER BY (
        SUM(CASE WHEN e.verify_verdict = 'fabricated' THEN 1 ELSE 0 END)::float
        / NULLIF(COUNT(*), 0)
      ) DESC,
      COUNT(*) DESC`,
  )) as Row[]

  const enriched = rows.map((r) => {
    const verifiedTotal = r.real + r.generic + r.fabricated + r.uncertain
    const realPct = verifiedTotal > 0 ? Math.round((r.real / verifiedTotal) * 100) : null
    const fakePct = verifiedTotal > 0 ? Math.round((r.fabricated / verifiedTotal) * 100) : null
    let healthGrade: 'A' | 'B' | 'C' | 'D' | 'F'
    if (realPct == null) healthGrade = 'C'
    else if (realPct >= 90) healthGrade = 'A'
    else if (realPct >= 75) healthGrade = 'B'
    else if (realPct >= 60) healthGrade = 'C'
    else if (realPct >= 40) healthGrade = 'D'
    else healthGrade = 'F'
    return {
      sourceName: r.source_name,
      sourceId: r.source_id,
      counts: {
        real: r.real,
        generic: r.generic,
        fabricated: r.fabricated,
        uncertain: r.uncertain,
        unverified: r.unverified,
        total: r.total,
      },
      realPct,
      fakePct,
      healthGrade,
      lastScrapedAt: r.last_scraped_at,
      lastScrapeStatus: r.last_scrape_status,
      reliability: r.reliability,
    }
  })

  return NextResponse.json({ ok: true, sources: enriched })
}
