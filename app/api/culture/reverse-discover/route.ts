/**
 * POST /api/culture/reverse-discover
 *
 * Reverse-flow trend matching. Instead of "we found these trends, which
 * fit Action?", this asks: "Given THIS Action product category, which
 * currently active trends could it lean into?".
 *
 * Useful for the studio team — they pick a category, get a curated
 * shortlist of trends with ranked Action-fit + content angles.
 *
 * Body: { category: string, limit?: number }
 *   category: free-text Action product category ("home cleaning",
 *             "kids toys", "back to school", "garden", "beauty essentials")
 *
 * Match logic: pull all active trends whose brand_brief.productCategories
 * contain a fuzzy match. Then rank by growth_score + popularity within
 * the matches.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 30

interface Row {
  id: string
  name: string
  slug: string
  description: string
  category: string
  popularity_score: number
  growth_score: number | null
  brand_brief: {
    productCategories?: string[]
    contentAngle?: string
    actionRelevance?: string
    suggestedSound?: string
    soundRisk?: string
    urgency?: number
  } | null
  hashtags: string[] | null
  vibe: string | null
  subculture: string | null
  lifecycle_stage: string | null
}

export async function POST(req: NextRequest) {
  let body: { category?: string; limit?: number } = {}
  try { body = await req.json().catch(() => ({})) } catch { /* */ }
  const category = (body.category ?? '').trim().toLowerCase()
  const limit = Math.min(40, Math.max(5, body.limit ?? 20))
  if (!category) {
    return NextResponse.json({ error: 'category required (e.g. "home cleaning", "beauty essentials")' }, { status: 400 })
  }

  // Pull trends whose brand_brief.productCategories ILIKE any keyword in
  // the user's category string, OR whose name/description mentions it.
  const keywords = category.split(/\s+/).filter((k) => k.length >= 3)

  // Build a flexible WHERE: jsonb path match OR text match
  const rows = (await sql().query(
    `SELECT id, name, slug, description, category, popularity_score, growth_score,
            brand_brief, hashtags, vibe, subculture, lifecycle_stage
       FROM culture_trends
      WHERE status = 'active'
        AND verify_verdict != 'fabricated' OR verify_verdict IS NULL
      LIMIT 800`,
  )) as Row[]

  // Score each trend by fit
  const scored = rows.map((r) => {
    let fit = 0
    const pc = (r.brand_brief?.productCategories ?? []).join(' ').toLowerCase()
    const lower = (r.name + ' ' + r.description).toLowerCase()
    for (const kw of keywords) {
      if (pc.includes(kw)) fit += 3
      if (lower.includes(kw)) fit += 1
    }
    // Bonus: trend popularity + growth + recent urgency
    const urgency = r.brand_brief?.urgency ?? 5
    const growth = r.growth_score == null ? 0 : Number(r.growth_score)
    const totalScore =
      fit * 2 +
      Math.min(r.popularity_score, 10) * 0.3 +
      growth * 0.4 +
      urgency * 0.2
    return { ...r, fit, totalScore }
  })
  .filter((r) => r.fit > 0)
  .sort((a, b) => b.totalScore - a.totalScore)
  .slice(0, limit)

  return NextResponse.json({
    ok: true,
    category,
    matches: scored.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description.slice(0, 240),
      category: r.category,
      popularity: r.popularity_score,
      growth: r.growth_score == null ? null : Number(r.growth_score),
      lifecycleStage: r.lifecycle_stage,
      vibe: r.vibe,
      subculture: r.subculture,
      actionAngle: r.brand_brief?.contentAngle ?? null,
      actionRelevance: r.brand_brief?.actionRelevance ?? null,
      productCategories: r.brand_brief?.productCategories ?? [],
      suggestedSound: r.brand_brief?.suggestedSound ?? null,
      soundRisk: r.brand_brief?.soundRisk ?? null,
      fitScore: r.fit,
      compositeScore: Math.round(r.totalScore * 10) / 10,
    })),
  })
}
