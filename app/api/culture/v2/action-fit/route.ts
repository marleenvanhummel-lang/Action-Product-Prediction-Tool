/**
 * POST /api/culture/v2/action-fit
 *
 * Recomputes Action Fit score for trends whose inputs may have changed.
 * Persists action_fit_score, action_fit_by_market, recommended_market.
 *
 * Auth: write endpoint, requires Bearer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { computeActionFit, pickRecommendedMarkets } from '@/lib/scoring/action-fit'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

interface TrendRow {
  id: string
  category: string
  country_relevance: string[] | null
  vibe: string | null
  lifecycle_stage: 'emerging' | 'climbing' | 'peak' | 'declining' | 'dormant' | null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { limit?: number }
  const limit = Math.min(500, Math.max(1, body.limit ?? 100))

  const rows = (await sql().query(
    `SELECT id, category, country_relevance, vibe, lifecycle_stage
       FROM culture_trends
      WHERE status = 'active'
        AND (action_fit_computed_at IS NULL OR action_fit_computed_at < updated_at)
      ORDER BY updated_at DESC
      LIMIT $1`,
    [limit],
  )) as TrendRow[]

  let processed = 0
  let errors = 0
  for (const r of rows) {
    try {
      const fit = computeActionFit({
        category: r.category,
        countryRelevance: r.country_relevance ?? [],
        vibe: r.vibe,
        lifecycleStage: r.lifecycle_stage,
      })
      const markets = pickRecommendedMarkets(fit)
      await sql().query(
        `UPDATE culture_trends
            SET action_fit_score = $1,
                action_fit_by_market = $2::jsonb,
                recommended_market = $3,
                action_fit_computed_at = NOW()
          WHERE id = $4`,
        [fit.total, JSON.stringify(fit.byMarket), markets, r.id],
      )
      processed++
    } catch (err) {
      errors++
      console.error(`[v2/action-fit] failed for ${r.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    errors,
    requested: rows.length,
  })
}
