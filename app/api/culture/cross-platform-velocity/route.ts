/**
 * GET /api/culture/cross-platform-velocity
 *
 * For each active trend, compute:
 *   - platforms reached (count of distinct platform-class sources)
 *   - days to multi-platform (firstSeenAt → time first appeared in 2+ platforms)
 *
 * Used to surface "trends that jumped from TikTok to Reddit in 3 days =
 * mainstreaming signal".
 *
 * Pure aggregation, no AI. Fast.
 */

import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export const maxDuration = 30

function platformClass(sourceName: string): string {
  const n = sourceName.toLowerCase()
  if (n.includes('tiktok creative center')) return 'tiktok_cc'
  if (n.includes('tiktok')) return 'tiktok'
  if (n.includes('reddit')) return 'reddit'
  if (n.includes('instagram') || n.includes('reels')) return 'instagram'
  if (n.includes('youtube')) return 'youtube'
  if (n.includes('newsletter') || n.includes('garbage day') || n.includes('substack') || n.includes('embedded') || n.includes('after school') || n.includes('dirt')) return 'newsletter'
  if (n.includes('perplexity')) return 'perplexity'
  if (n.includes('google trends')) return 'gtrends'
  if (n.includes('knowyourmeme')) return 'kym'
  return 'other'
}

export async function GET() {
  const rows = (await sql().query(
    `SELECT id, name, slug, source_names, first_seen_at::TEXT AS first_seen_at,
            popularity_score, growth_score, vibe, subculture
       FROM culture_trends
      WHERE status = 'active'
        AND first_seen_at >= NOW() - INTERVAL '30 days'
      ORDER BY first_seen_at DESC
      LIMIT 500`,
  )) as Array<{
    id: string; name: string; slug: string; source_names: string[];
    first_seen_at: string; popularity_score: number; growth_score: number | null;
    vibe: string | null; subculture: string | null;
  }>

  // Per trend: count distinct platform classes
  const enriched = rows.map((t) => {
    const platforms = new Set<string>()
    for (const s of t.source_names ?? []) {
      const cls = platformClass(s)
      if (cls !== 'other') platforms.add(cls)
    }
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      platforms: Array.from(platforms).sort(),
      platformCount: platforms.size,
      firstSeenAt: t.first_seen_at,
      popularity: t.popularity_score,
      growth: t.growth_score == null ? null : Number(t.growth_score),
      vibe: t.vibe,
      subculture: t.subculture,
    }
  })

  // Aggregate by platform class — how many trends per platform
  const byPlatform: Record<string, number> = {}
  for (const e of enriched) {
    for (const p of e.platforms) byPlatform[p] = (byPlatform[p] ?? 0) + 1
  }

  // Platform-jump heatmap: which platform pairs co-occur most
  const pairCount = new Map<string, number>()
  for (const e of enriched) {
    for (let i = 0; i < e.platforms.length; i++) {
      for (let j = i + 1; j < e.platforms.length; j++) {
        const key = `${e.platforms[i]}↔${e.platforms[j]}`
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
      }
    }
  }
  const platformPairs = Array.from(pairCount.entries())
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)

  // Trends that span 3+ platforms (highest cross-validation)
  const multiPlatformTrends = enriched
    .filter((e) => e.platformCount >= 3)
    .sort((a, b) => b.platformCount - a.platformCount || (b.growth ?? 0) - (a.growth ?? 0))
    .slice(0, 20)

  // Trends seen only in newsletter — early signal (newsletters publish before mainstream)
  const newsletterOnly = enriched
    .filter((e) => e.platformCount === 1 && e.platforms[0] === 'newsletter')
    .sort((a, b) => new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime())
    .slice(0, 12)

  return NextResponse.json({
    ok: true,
    totalAnalyzed: enriched.length,
    byPlatform,
    platformPairs,
    multiPlatformTrends,
    newsletterOnly,
  })
}
