/**
 * GET /api/culture/v2/review-queue
 *
 * Lists trends in `decision_state = validate` so a reviewer can work
 * through them. Sorted by confidence DESC (highest-quality first).
 *
 * Public read — no auth required. Acting on a trend (transition state)
 * goes through /api/culture/v2/decision and requires auth.
 */
import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  confidence_score: number | null
  action_fit_score: number | null
  first_seen_at: string
  source_names: string[] | null
  decision_owner: string | null
  thumbnail_url: string | null
}

export async function GET() {
  const rows = (await sql().query(
    `SELECT id, slug, name, description, category,
            confidence_score, action_fit_score,
            first_seen_at::TEXT AS first_seen_at,
            source_names, decision_owner, thumbnail_url
       FROM culture_trends
      WHERE status = 'active' AND decision_state = 'validate'
      ORDER BY confidence_score DESC NULLS LAST, first_seen_at DESC
      LIMIT 100`,
  )) as Row[]

  return NextResponse.json({
    count: rows.length,
    trends: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      category: r.category,
      confidenceScore: r.confidence_score,
      actionFitScore: r.action_fit_score,
      firstSeenAt: r.first_seen_at,
      sourceNames: r.source_names ?? [],
      decisionOwner: r.decision_owner,
      thumbnailUrl: r.thumbnail_url,
    })),
  })
}
