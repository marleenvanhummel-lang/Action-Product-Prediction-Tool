/**
 * GET /api/culture/subculture-trajectory
 *
 * For each subculture, return:
 *   - trends this week (count + avg growth)
 *   - trends last week (count + avg growth)
 *   - delta (rising/falling)
 *   - top 3 representative trends this week
 *
 * Used by the "Subculture trajectory" dashboard panel — surfaces which
 * subcultures are accelerating vs fading regardless of their absolute size.
 */

import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 30

interface Row {
  subculture: string
  week: 'this' | 'last'
  trend_count: number
  avg_growth: number | null
  sample_names: string[]
}

export async function GET() {
  // Two queries, one per week, then join in app code
  const buckets = (await sql().query(
    `WITH this_week AS (
       SELECT subculture,
              COUNT(*)::int AS trend_count,
              AVG(growth_score)::float AS avg_growth,
              array_agg(name ORDER BY popularity_score DESC) AS sample_names
         FROM culture_trends
        WHERE status = 'active'
          AND subculture IS NOT NULL
          AND first_seen_at >= NOW() - INTERVAL '7 days'
        GROUP BY subculture
     ),
     last_week AS (
       SELECT subculture,
              COUNT(*)::int AS trend_count,
              AVG(growth_score)::float AS avg_growth
         FROM culture_trends
        WHERE status = 'active'
          AND subculture IS NOT NULL
          AND first_seen_at >= NOW() - INTERVAL '14 days'
          AND first_seen_at <  NOW() - INTERVAL '7 days'
        GROUP BY subculture
     )
     SELECT
       COALESCE(t.subculture, l.subculture) AS subculture,
       COALESCE(t.trend_count, 0)        AS this_count,
       COALESCE(t.avg_growth, 0)         AS this_growth,
       COALESCE(t.sample_names, '{}')    AS sample_names,
       COALESCE(l.trend_count, 0)        AS last_count,
       COALESCE(l.avg_growth, 0)         AS last_growth
     FROM this_week t
     FULL OUTER JOIN last_week l ON t.subculture = l.subculture
     ORDER BY COALESCE(t.trend_count, 0) DESC,
              COALESCE(l.trend_count, 0) DESC`,
  )) as Array<{
    subculture: string
    this_count: number
    this_growth: number
    sample_names: string[]
    last_count: number
    last_growth: number
  }>

  const enriched = buckets.map((b) => {
    const delta = b.this_count - b.last_count
    const growthDelta = (b.this_growth ?? 0) - (b.last_growth ?? 0)
    let trajectory: 'rising' | 'fading' | 'stable' | 'new' | 'gone'
    if (b.last_count === 0 && b.this_count > 0) trajectory = 'new'
    else if (b.this_count === 0 && b.last_count > 0) trajectory = 'gone'
    else if (delta >= 2 || growthDelta >= 1.5) trajectory = 'rising'
    else if (delta <= -2 || growthDelta <= -1.5) trajectory = 'fading'
    else trajectory = 'stable'

    return {
      subculture: b.subculture,
      thisWeek: { count: b.this_count, avgGrowth: Math.round(Number(b.this_growth) * 10) / 10 },
      lastWeek: { count: b.last_count, avgGrowth: Math.round(Number(b.last_growth) * 10) / 10 },
      delta,
      growthDelta: Math.round(growthDelta * 10) / 10,
      trajectory,
      topTrends: (b.sample_names ?? []).slice(0, 3),
    }
  })

  return NextResponse.json({ ok: true, subcultures: enriched })
}
