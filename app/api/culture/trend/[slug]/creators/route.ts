/**
 * GET /api/culture/trend/[slug]/creators
 *
 * Match creators from culture_creators to a specific trend. Used on the
 * per-trend detail page as "who should Action collab with for this?"
 *
 * Match logic — pure DB, no AI:
 *   - Same country_relevance overlap
 *   - Same subculture if tagged
 *   - Same vibe / category cues
 *   - Tag overlap (creators have tags like #beauty, #cleaning)
 *
 * Ranked by composite fit score.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 15

interface TrendRow {
  id: string
  category: string
  subculture: string | null
  vibe: string | null
  country_relevance: string[] | null
  hashtags: string[] | null
}

interface CreatorRow {
  id: string
  handle: string
  platform: string
  profile_url: string | null
  name: string | null
  niche: string | null
  why_relevant: string | null
  follower_count: number | null
  country_relevance: string[] | null
  example_video_urls: string[] | null
  tags: string[] | null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  // Lookup trend
  const trendRows = (await sql().query(
    `SELECT id, category, subculture, vibe, country_relevance, hashtags
       FROM culture_trends WHERE slug = $1 LIMIT 1`,
    [slug],
  )) as TrendRow[]
  if (trendRows.length === 0) {
    return NextResponse.json({ error: 'trend_not_found' }, { status: 404 })
  }
  const trend = trendRows[0]
  const trendCountries = trend.country_relevance ?? []
  const trendHashtagSet = new Set((trend.hashtags ?? []).map((h) => h.toLowerCase().replace(/^#/, '')))

  // Pull all creators
  const creators = (await sql().query(
    `SELECT id, handle, platform, profile_url, name, niche, why_relevant,
            follower_count, country_relevance, example_video_urls, tags
       FROM culture_creators
      WHERE status IS NULL OR status != 'archived'
      LIMIT 1000`,
  )) as CreatorRow[]

  // Score each creator
  const scored = creators.map((c) => {
    const cCountries = c.country_relevance ?? []
    const cTags = (c.tags ?? []).map((t) => t.toLowerCase())
    const niche = (c.niche ?? '').toLowerCase()
    const why = (c.why_relevant ?? '').toLowerCase()

    let score = 0
    const reasons: string[] = []

    // Country overlap
    if (trendCountries.length > 0 && trendCountries.length < 14 && cCountries.length > 0) {
      const overlap = cCountries.filter((c) => trendCountries.includes(c))
      if (overlap.length > 0) { score += 4 * overlap.length; reasons.push(`country: ${overlap.join(', ')}`) }
    }

    // Subculture cue in niche/why
    if (trend.subculture) {
      const sub = trend.subculture.replace(/_/g, ' ')
      if (niche.includes(sub) || why.includes(sub) || cTags.includes(sub)) {
        score += 6; reasons.push(`subculture: ${trend.subculture}`)
      }
    }

    // Vibe cue
    if (trend.vibe) {
      if (niche.includes(trend.vibe) || why.includes(trend.vibe) || cTags.includes(trend.vibe)) {
        score += 3; reasons.push(`vibe: ${trend.vibe}`)
      }
    }

    // Category match
    if (trend.category && (niche.includes(trend.category) || cTags.includes(trend.category))) {
      score += 3; reasons.push(`category: ${trend.category}`)
    }

    // Hashtag overlap
    for (const tag of cTags) {
      if (trendHashtagSet.has(tag)) { score += 2; reasons.push(`hashtag: #${tag}`) }
    }

    return { creator: c, score, reasons }
  })
  .filter((s) => s.score >= 3)
  .sort((a, b) => b.score - a.score)
  .slice(0, 12)

  return NextResponse.json({
    ok: true,
    trendSlug: slug,
    creatorCount: scored.length,
    creators: scored.map((s) => ({
      handle: s.creator.handle,
      platform: s.creator.platform,
      profileUrl: s.creator.profile_url,
      name: s.creator.name,
      niche: s.creator.niche,
      whyRelevant: s.creator.why_relevant,
      followerCount: s.creator.follower_count,
      countries: s.creator.country_relevance ?? [],
      tags: s.creator.tags ?? [],
      exampleVideoUrls: s.creator.example_video_urls ?? [],
      fitScore: s.score,
      matchReasons: s.reasons,
    })),
  })
}
