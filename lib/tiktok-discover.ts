/**
 * TikTok /discover page parser.
 *
 * The /discover/{topic} pages are TikTok's SEO-friendly topic landing
 * pages. They're refreshed weekly and contain a curated list of top
 * videos for the topic, with real creator handles and video IDs.
 *
 * TikTok removed __NEXT_DATA__ in recent versions, so we can't read
 * structured data from initial HTML. Instead:
 *   1. Use Firecrawl (JS-render) to fetch the page
 *   2. Parse the rendered HTML for /@username/video/ID links
 *   3. Aggregate distinct creator + video pairs
 *   4. For each creator, count appearances (signal: who's dominating?)
 *
 * This bypasses the generic Gemini extraction step for /discover sources
 * because the extraction is deterministic — no hallucination risk for
 * the video list itself.
 */

export interface DiscoverItem {
  topic: string           // slug, e.g. "nederlandse-trends"
  videoId: string         // TikTok video ID
  creator: string         // @handle without the @
  videoUrl: string        // canonical https URL
  lastUpdated?: string    // ISO date if visible
}

export interface DiscoverParseResult {
  topic: string
  pageTitle: string | null
  lastUpdated: string | null
  videos: DiscoverItem[]
  topCreators: Array<{ creator: string; count: number }>
  relatedTopics: string[]  // links to other /discover slugs found on the page
}

/**
 * Parse a TikTok /discover page's rendered HTML for the structured data
 * we care about.
 */
export function parseDiscoverHtml(html: string, topicSlug: string): DiscoverParseResult {
  // /@creator/video/123456 pattern
  const videoLinkRe = /\/@([a-zA-Z0-9._-]+)\/video\/(\d+)/g
  const videosMap = new Map<string, DiscoverItem>()
  let match: RegExpExecArray | null
  while ((match = videoLinkRe.exec(html)) !== null) {
    const creator = match[1]
    const videoId = match[2]
    const key = `${creator}/${videoId}`
    if (!videosMap.has(key)) {
      videosMap.set(key, {
        topic: topicSlug,
        videoId,
        creator,
        videoUrl: `https://www.tiktok.com/@${creator}/video/${videoId}`,
      })
    }
  }
  const videos = Array.from(videosMap.values())

  // Creator count
  const creatorCount = new Map<string, number>()
  for (const v of videos) {
    creatorCount.set(v.creator, (creatorCount.get(v.creator) ?? 0) + 1)
  }
  const topCreators = Array.from(creatorCount.entries())
    .map(([creator, count]) => ({ creator, count }))
    .sort((a, b) => b.count - a.count)

  // Page title (h1 or document title)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
  const pageTitle = titleMatch ? titleMatch[1].replace(/\s*\|\s*TikTok.*$/, '').trim() : null

  // Last updated — "Last updated YYYY-MM-DD" or "updated YYYY-MM-DD"
  const updatedMatch = html.match(/[Ll]ast\s+updated\s+(\d{4}-\d{2}-\d{2})/)
  const lastUpdated = updatedMatch ? updatedMatch[1] : null

  // Related discover topics
  const relatedRe = /\/discover\/([a-zA-Z0-9-]+)/g
  const relatedSet = new Set<string>()
  while ((match = relatedRe.exec(html)) !== null) {
    if (match[1] && match[1] !== topicSlug && match[1].length > 1) {
      relatedSet.add(match[1])
    }
  }
  const relatedTopics = Array.from(relatedSet).slice(0, 20)

  return {
    topic: topicSlug,
    pageTitle,
    lastUpdated,
    videos,
    topCreators,
    relatedTopics,
  }
}

/**
 * Take a parsed /discover result and convert it to a synthetic markdown
 * payload that the rest of the pipeline (AI extraction, scrape_results
 * table) can store. Optimised for high-signal: includes the structured
 * data inline so Gemini doesn't need to guess.
 */
export function discoverResultToMarkdown(r: DiscoverParseResult): string {
  const lines: string[] = []
  lines.push(`# TikTok /discover/${r.topic}`)
  if (r.pageTitle) lines.push(`Title: ${r.pageTitle}`)
  if (r.lastUpdated) lines.push(`Last updated: ${r.lastUpdated}`)
  lines.push(`Videos found: ${r.videos.length}`)
  lines.push(`Distinct creators: ${r.topCreators.length}`)
  lines.push('')

  if (r.topCreators.length > 0) {
    lines.push(`## Top creators on this topic`)
    for (const c of r.topCreators.slice(0, 10)) {
      lines.push(`- @${c.creator} (${c.count} videos)`)
    }
    lines.push('')
  }

  if (r.videos.length > 0) {
    lines.push(`## Top videos`)
    for (const v of r.videos.slice(0, 15)) {
      lines.push(`- @${v.creator} — ${v.videoUrl}`)
    }
    lines.push('')
  }

  if (r.relatedTopics.length > 0) {
    lines.push(`## Related topics on TikTok`)
    lines.push(r.relatedTopics.map((t) => `#${t}`).join(' '))
  }

  return lines.join('\n')
}
