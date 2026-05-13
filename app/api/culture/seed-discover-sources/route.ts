/**
 * POST /api/culture/seed-discover-sources
 *
 * Adds TikTok /discover topic landing pages as scrape sources. These
 * are TikTok's own SEO landing pages — curated weekly with top trending
 * videos for a topic. Examples:
 *   /discover/nederlandse-trends     — last updated weekly
 *   /discover/viral                  — global viral
 *   /discover/trending               — global trending
 *
 * The pages are JS-rendered (no __NEXT_DATA__ anymore) so Firecrawl
 * handles them. The markdown includes 15+ real video links with
 * creator handles which the AI extractor picks up as trends.
 *
 * Idempotent. Run once after deploy.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

interface Src {
  name: string
  slug: string
  category: string
  notes: string
}

const SOURCES: Src[] = [
  // Country-curated discover pages
  { name: 'TikTok Discover · Nederlandse Trends',  slug: 'nederlandse-trends',  category: 'platform', notes: 'NL curated weekly trends landing page' },
  { name: 'TikTok Discover · Belgische Trends',    slug: 'belgische-trends',    category: 'platform', notes: 'BE curated weekly trends' },
  { name: 'TikTok Discover · Tendances Françaises', slug: 'tendances-francaises', category: 'platform', notes: 'FR curated weekly trends' },
  { name: 'TikTok Discover · Deutsche Trends',     slug: 'deutsche-trends',     category: 'platform', notes: 'DE curated weekly trends' },
  { name: 'TikTok Discover · Tendencias Españolas', slug: 'tendencias-espanolas', category: 'platform', notes: 'ES curated weekly trends' },
  { name: 'TikTok Discover · Tendenze Italiane',   slug: 'tendenze-italiane',   category: 'platform', notes: 'IT curated weekly trends' },
  { name: 'TikTok Discover · Tendências Portuguesas', slug: 'tendencias-portuguesas', category: 'platform', notes: 'PT curated weekly trends' },
  { name: 'TikTok Discover · Trendy w Polsce',     slug: 'trendy-w-polsce',     category: 'platform', notes: 'PL curated weekly trends' },

  // Global discover topics
  { name: 'TikTok Discover · Viral',               slug: 'viral',               category: 'platform', notes: 'Global viral topic page' },
  { name: 'TikTok Discover · Trending',            slug: 'trending',            category: 'platform', notes: 'Global trending topic page' },
  { name: 'TikTok Discover · For You',             slug: 'foryou',              category: 'platform', notes: 'For You algorithm-led trending' },

  // Vertical / format-specific discover topics
  { name: 'TikTok Discover · Dance Trends',        slug: 'dance-trends',        category: 'culture',  notes: 'Trending dance formats' },
  { name: 'TikTok Discover · Food Trends',         slug: 'food-trends',         category: 'food',     notes: 'Trending food content' },
  { name: 'TikTok Discover · Beauty Trends',       slug: 'beauty-trends',       category: 'beauty',   notes: 'Trending beauty content' },
  { name: 'TikTok Discover · Fashion Trends',      slug: 'fashion-trends',      category: 'fashion',  notes: 'Trending fashion content' },
  { name: 'TikTok Discover · Life Hacks',          slug: 'life-hacks',          category: 'lifestyle', notes: 'Trending life-hack format' },
  { name: 'TikTok Discover · Comedy',              slug: 'comedy',              category: 'meme',     notes: 'Trending comedy content' },
  { name: 'TikTok Discover · Music Trends',        slug: 'music-trends',        category: 'sound',    notes: 'Trending music / sound content' },
]

export async function POST(_req: NextRequest) {
  const results: Array<{ slug: string; inserted: boolean }> = []
  let newCount = 0

  for (const s of SOURCES) {
    const url = `https://www.tiktok.com/discover/${s.slug}`
    const rows = await sql().query(
      `INSERT INTO culture_sources
          (name, url, category, source_type, reliability, detection_lag_days, active, notes)
       VALUES ($1, $2, $3, 'blog', 7, 1, true, $4)
       ON CONFLICT (url) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         notes = EXCLUDED.notes,
         active = true
       RETURNING (xmax = 0) AS inserted`,
      [s.name, url, s.category, s.notes],
    ) as Array<{ inserted: boolean }>
    const inserted = rows[0]?.inserted ?? false
    if (inserted) newCount++
    results.push({ slug: s.slug, inserted })
  }

  return NextResponse.json({
    ok: true,
    total: SOURCES.length,
    new: newCount,
    updated: SOURCES.length - newCount,
    sources: results,
    note: 'TikTok /discover pages are weekly-curated by TikTok itself with real videos + creators. Firecrawl renders the JS, extractor picks up the videos as trends. Best signal for "what is hot in country X this week".',
  })
}
