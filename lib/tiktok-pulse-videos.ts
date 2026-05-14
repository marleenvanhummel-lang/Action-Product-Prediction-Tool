/**
 * Fetch a curated mix of TikTok videos parsed from /discover scrapes
 * for the newsletter. Returns a small grid (4-6 items) of country-tagged
 * trending TikToks.
 */

import { sql } from '@/lib/culture-db'

export interface DiscoverVideoForReport {
  creator: string
  videoId: string
  videoUrl: string
  countryFlag: string
  countryLabel: string
  sourceTopic: string
}

const COUNTRY_FLAGS: Record<string, { flag: string; label: string }> = {
  'nederlandse-trends':   { flag: '🇳🇱', label: 'Netherlands' },
  'belgische-trends':     { flag: '🇧🇪', label: 'Belgium' },
  'tendances-francaises': { flag: '🇫🇷', label: 'France' },
  'deutsche-trends':      { flag: '🇩🇪', label: 'Germany' },
  'tendencias-espanolas': { flag: '🇪🇸', label: 'Spain' },
  'tendenze-italiane':    { flag: '🇮🇹', label: 'Italy' },
  'tendencias-portuguesas': { flag: '🇵🇹', label: 'Portugal' },
  'trendy-w-polsce':      { flag: '🇵🇱', label: 'Poland' },
  'viral':                { flag: '🌐', label: 'Global Viral' },
  'trending':             { flag: '🌐', label: 'Global Trending' },
  'foryou':               { flag: '🌐', label: 'For You' },
  'dance-trends':         { flag: '💃', label: 'Dance' },
  'food-trends':          { flag: '🍴', label: 'Food' },
  'beauty-trends':        { flag: '💄', label: 'Beauty' },
  'fashion-trends':       { flag: '👗', label: 'Fashion' },
  'life-hacks':           { flag: '🧠', label: 'Life Hacks' },
  'comedy':               { flag: '😂', label: 'Comedy' },
  'music-trends':         { flag: '🎵', label: 'Music' },
}

/**
 * Pull recent /discover scrape results, parse out video URLs, pick a
 * geographically + topically diverse set.
 */
export async function fetchPulseVideos(maxVideos = 6): Promise<DiscoverVideoForReport[]> {
  // Get latest scrape per /discover source from last 48h
  const rows = (await sql().query(
    `SELECT DISTINCT ON (source_id)
            source_id, source_name, url, text_snippet, scraped_at
       FROM culture_scrape_results
      WHERE url ILIKE '%tiktok.com/discover/%'
        AND status = 'ok'
        AND scraped_at >= NOW() - INTERVAL '48 hours'
        AND length(text_snippet) > 200
      ORDER BY source_id, scraped_at DESC
      LIMIT 30`,
  )) as Array<{ source_id: number; source_name: string; url: string; text_snippet: string; scraped_at: string }>

  // Parse video URLs from each scrape's text_snippet (which is our
  // discoverResultToMarkdown output: lists "@creator — https://...")
  const videoLinkRe = /https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9._-]+)\/video\/(\d+)/g
  const collected: DiscoverVideoForReport[] = []
  const seenVideoIds = new Set<string>()
  const seenCreators = new Set<string>()

  for (const r of rows) {
    const slugMatch = r.url.match(/\/discover\/([^/?#]+)/)
    const slug = slugMatch ? slugMatch[1] : 'unknown'
    const meta = COUNTRY_FLAGS[slug] ?? { flag: '📱', label: slug }

    // Take up to 2 videos per source to keep variety
    let perSource = 0
    let m: RegExpExecArray | null
    videoLinkRe.lastIndex = 0
    while ((m = videoLinkRe.exec(r.text_snippet)) !== null && perSource < 2) {
      const creator = m[1]
      const videoId = m[2]
      if (seenVideoIds.has(videoId) || seenCreators.has(creator)) continue
      collected.push({
        creator,
        videoId,
        videoUrl: `https://www.tiktok.com/@${creator}/video/${videoId}`,
        countryFlag: meta.flag,
        countryLabel: meta.label,
        sourceTopic: slug,
      })
      seenVideoIds.add(videoId)
      seenCreators.add(creator)
      perSource++
    }
  }

  // Shuffle slightly and return top N
  return collected.slice(0, maxVideos)
}
