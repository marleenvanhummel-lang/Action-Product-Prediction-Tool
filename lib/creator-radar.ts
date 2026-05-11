/**
 * Creator Radar — daily scan of 25 niche creators.
 *
 * Each day a new "cohort" of 25 creators is surfaced via Perplexity.
 * Profile pattern: cultural translators, niche reaction commentators,
 * format-driven creators — the kind a brand team should know about but
 * doesn't yet.
 *
 * Stored in culture_creators with a cohort_date so we can show "today's
 * 25" vs "yesterday's 25" vs the running archive.
 */

import { sql } from '@/lib/culture-db'
import { perplexitySearch, extractVideoUrls } from '@/lib/perplexity'
import { verifyVideoUrls } from '@/lib/url-verification'

export interface DiscoveredCreator {
  handle: string
  platform: 'tiktok' | 'instagram' | 'youtube'
  profileUrl: string
  name: string
  niche: string
  whyRelevant: string
  followerCount: number | null
  countryRelevance: string[]
  exampleVideoUrls: string[]
  tags: string[]
}

// Rotating "lens" prompts so the 25 creators are different each day.
// Each lens asks for a distinct flavour of culturally-translated creator.
const CREATOR_LENSES: { tag: string; prompt: string }[] = [
  {
    tag: 'reaction-commentary',
    prompt: 'cultural translator creators who react to and comment on internet trends, viral moments, or Gen Z humor — like @zendeeofficial reacting to Gen Z humor in Tagalog',
  },
  {
    tag: 'format-inventors',
    prompt: 'creators who invented or popularized a specific named TikTok/Reels content format (a specific editing trick, POV pattern, fake-out reveal)',
  },
  {
    tag: 'niche-aesthetic-curators',
    prompt: 'creators who curate or define a very specific named aesthetic (like Brat green, Coastal Grandmother, Office Siren) and their feeds embody that look',
  },
  {
    tag: 'cultural-deep-divers',
    prompt: 'creators making short-form video essays / explainers about subcultures, niche internet phenomena, or "why is everyone obsessed with X" content',
  },
  {
    tag: 'unhinged-niche',
    prompt: 'unhinged, absurdist, anti-aesthetic, or hyper-niche creators with strong distinctive personalities (think face-sticker formats, deadpan POVs, oddly-specific running jokes)',
  },
  {
    tag: 'dutch-flemish-niche',
    prompt: 'Dutch and Flemish creators (@handles in NL/BE) doing distinctive niche content — Dutch-language humor, NL-specific reactions, locally-relevant formats',
  },
  {
    tag: 'product-discovery',
    prompt: 'creators driving #TikTokMadeMeBuyIt style product-discovery content for affordable everyday products (under €15) — household, beauty, kitchen, kids',
  },
  {
    tag: 'food-hack',
    prompt: 'food-hack and recipe creators turning everyday grocery products into viral viral recipes (snackle boxes, Dubai chocolate, viral lasagnas)',
  },
  {
    tag: 'cleaning-organisation',
    prompt: 'cleaning, organisation, and "satisfying transformation" creators — cleanfluencers, declutter coaches, before/after specialists',
  },
  {
    tag: 'parenting-relatable',
    prompt: 'parenting / kids / family creators doing relatable everyday-mom or weird-dad content with sharp humor — not influencer-mom style',
  },
]

function todayLens(): { tag: string; prompt: string } {
  // Day-of-year mod lenses → guarantees different lens each day, full
  // cycle every 10 days. Combined with Perplexity variance this gives
  // a fresh 25 every morning.
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  )
  return CREATOR_LENSES[dayOfYear % CREATOR_LENSES.length]
}

export async function discoverDailyCreators(opts: {
  countOverride?: number
  lensOverride?: string
} = {}): Promise<{ ok: boolean; creators: DiscoveredCreator[]; lens: string; error?: string }> {
  const count = opts.countOverride ?? 25
  const lens = opts.lensOverride
    ? CREATOR_LENSES.find((l) => l.tag === opts.lensOverride) ?? todayLens()
    : todayLens()

  const query = `List ${count} REAL, VERIFIABLE creators on TikTok / Instagram / YouTube that fit this profile: ${lens.prompt}.

CRITICAL RULES:
1. DO NOT invent creators. If you cannot confirm the @handle exists, skip it.
2. Each creator MUST be referenced in at least one cited source (news article, brand database, social media press, listicle from a real outlet).
3. NO themed-sounding made-up handles like @pierogimadness or @globalglitchguru. Real creators rarely have on-the-nose names matching their niche.
4. Prefer creators that already have Wikipedia pages, press coverage, brand partnerships, or appeared in published 'creators to watch' articles from real outlets like NYTimes, Bustle, Cosmopolitan, NRC, Dazed, etc.

For each creator, output in this EXACT markdown structure (one block per creator, separated by a blank line):

### 1. @handle
- **Platform:** TikTok | Instagram | YouTube
- **Profile URL:** https://www.tiktok.com/@... (full URL)
- **Name:** Real display name
- **Niche:** One short sentence describing what they make.
- **Why:** One sentence on why a brand marketing team would want to know about them.
- **Followers:** Approximate count (350K / 2.1M).
- **Country:** NL | BE | FR | DE | ES | IT | PL | UK | US | GLOBAL.
- **Videos:** Direct video URLs, one per line.
- **Tags:** keyword1, keyword2, keyword3.
- **Source:** Citation reference [1] or named outlet that confirms this creator exists.

Skip mainstream celebrities with 10M+ followers. Focus on real under-the-radar quality creators with documented existence. If you can only find 10 real ones, return 10 — don't pad with fabrications.`

  const research = await perplexitySearch(query, {
    model: 'sonar-pro',
    systemPromptOverride: `You are a creator-discovery researcher. ONLY list real creators whose existence is documented in articles, press coverage, or established databases. Fabricated, plausible-sounding handles are STRICTLY forbidden. When in doubt, leave them out. Real creators have unremarkable, hard-to-guess @handles, not on-the-nose theme names.`,
  })

  if (!research.ok || !research.text) {
    return { ok: false, creators: [], lens: lens.tag, error: research.error ?? 'no_data' }
  }

  const creators = parseCreators(research.text, lens.tag)
  return { ok: true, creators, lens: lens.tag }
}

// ── Markdown parser ────────────────────────────────────────────────────────

function parseCreators(text: string, lensTag: string): DiscoveredCreator[] {
  // Split into blocks per numbered creator. Accepts either:
  //   - "### 1. @handle"  (new structured format)
  //   - "1. @handle"      (legacy plain numbered list)
  const blocks = text
    .split(/(?=^#{1,3}\s*\d+\.\s|^\s*\d+\.\s)/m)
    .filter((b) => b.trim().length > 50)
  const creators: DiscoveredCreator[] = []

  for (const block of blocks) {
    const handle = extractHandle(block)
    if (!handle) continue

    const platform = detectPlatform(block, handle)
    const profileUrl =
      extractFirstUrl(block, ['tiktok.com/@', 'instagram.com/', 'youtube.com/@']) ||
      buildProfileUrl(handle, platform)

    const name = extractField(block, ['name', 'display name']) || handle
    const niche = extractField(block, ['niche', 'what they make', 'content']) || ''
    const whyRelevant = extractField(block, ['why', 'why they matter', 'relevance', 'matters']) || ''
    const followerCount = extractFollowerCount(block)
    const countries = extractCountries(block)
    const videos = extractVideoUrls(block).filter((u) => u !== profileUrl).slice(0, 3)
    const tags = extractTags(block, lensTag)

    creators.push({
      handle: handle.replace(/^@/, ''),
      platform,
      profileUrl,
      name,
      niche: niche.slice(0, 200),
      whyRelevant: whyRelevant.slice(0, 240),
      followerCount,
      countryRelevance: countries,
      exampleVideoUrls: videos,
      tags,
    })

    if (creators.length >= 30) break
  }

  return creators
}

function extractHandle(text: string): string | null {
  // Look for @handle pattern, prefer one with stronger context near "handle"
  const m = text.match(/@[A-Za-z0-9_.]{3,30}/)
  return m ? m[0] : null
}

function detectPlatform(text: string, _handle: string): 'tiktok' | 'instagram' | 'youtube' {
  const lower = text.toLowerCase()
  if (lower.includes('youtube')) return 'youtube'
  if (lower.includes('instagram')) return 'instagram'
  return 'tiktok'
}

function buildProfileUrl(handle: string, platform: 'tiktok' | 'instagram' | 'youtube'): string {
  const h = handle.replace(/^@/, '')
  if (platform === 'instagram') return `https://www.instagram.com/${h}`
  if (platform === 'youtube') return `https://www.youtube.com/@${h}`
  return `https://www.tiktok.com/@${h}`
}

function extractFirstUrl(text: string, includes: string[]): string {
  const urls = text.match(/https?:\/\/[^\s)<>"']+/g) ?? []
  for (const u of urls) {
    if (includes.some((needle) => u.toLowerCase().includes(needle))) return u
  }
  return ''
}

function extractField(text: string, keys: string[]): string {
  for (const key of keys) {
    // Match: "- **Key:** value", "**Key:** value", "Key: value", "Key — value"
    const re = new RegExp(`(?:^|\\n)\\s*[-*]?\\s*\\*?\\*?${key}\\*?\\*?\\s*[:—-]\\s*([^\\n]+)`, 'i')
    const m = text.match(re)
    if (m) {
      return m[1].trim().replace(/^\*+|\*+$/g, '').replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim().slice(0, 280)
    }
  }
  return ''
}

function extractFollowerCount(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*([KMB])\s*(?:followers?)?/i)
  if (!m) return null
  const num = parseFloat(m[1].replace(',', '.'))
  const mul = m[2].toUpperCase() === 'K' ? 1_000 : m[2].toUpperCase() === 'M' ? 1_000_000 : 1_000_000_000
  return Math.round(num * mul)
}

function extractCountries(text: string): string[] {
  const codes = ['NL', 'BE', 'FR', 'DE', 'ES', 'IT', 'PL', 'CZ', 'SK', 'HU', 'AT', 'CH', 'RO', 'PT', 'UK', 'US', 'GLOBAL']
  const found = new Set<string>()
  for (const c of codes) {
    const re = new RegExp(`\\b${c}\\b|\\b${c.toLowerCase()}\\b`, 'g')
    if (re.test(text)) found.add(c)
  }
  return Array.from(found).slice(0, 4)
}

function extractTags(text: string, lensTag: string): string[] {
  const tags = new Set<string>([lensTag])
  const m = text.match(/tags?\s*[:—-]\s*([^\n]+)/i)
  if (m) {
    for (const t of m[1].split(/[,;]/)) {
      const cleaned = t.trim().replace(/^#|^\*+|\*+$/g, '').toLowerCase()
      if (cleaned && cleaned.length > 2 && cleaned.length < 25) tags.add(cleaned)
    }
  }
  return Array.from(tags).slice(0, 6)
}

/**
 * Validate a TikTok profile URL by fetching it and checking the <title>.
 * Non-existent accounts show "Couldn't find this account" instead of the
 * creator's name. Returns false if the account doesn't exist.
 */
async function isLiveTikTokProfile(url: string): Promise<boolean> {
  if (!url.includes('tiktok.com/@')) return true  // only validate TikTok handles
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    })
    clearTimeout(t)
    if (!res.ok) return false
    const html = await res.text()
    // TikTok shows "Couldn't find this account" for missing handles.
    if (/Couldn't find this account/i.test(html)) return false
    if (/no longer available/i.test(html)) return false
    return true
  } catch {
    // Network errors → assume invalid to be safe
    return false
  }
}

// ── Persistence ────────────────────────────────────────────────────────────

export async function saveDailyCohort(
  creators: DiscoveredCreator[],
  lens: string,
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  let inserted = 0

  for (const c of creators) {
    // Validate the profile URL — TikTok 200-responds for missing handles
    // but the HTML title contains "Couldn't find this account".
    const profileOk = await isLiveTikTokProfile(c.profileUrl)
    if (!profileOk) {
      console.log('[creator-radar] dropped fabricated handle:', c.handle)
      continue
    }

    // Verify the video URLs separately (different validator path).
    let verifiedVideos = c.exampleVideoUrls
    if (c.exampleVideoUrls.length > 0) {
      const results = await verifyVideoUrls(c.exampleVideoUrls, {
        concurrency: 3,
        timeoutMs: 4000,
      })
      verifiedVideos = results.filter((r) => r.ok).map((r) => r.url)
    }
    const verifiedProfile = c.profileUrl

    try {
      await sql().query(
        `INSERT INTO culture_creators
           (handle, platform, profile_url, name, niche, why_relevant,
            follower_count, country_relevance, example_video_urls, tags,
            source_query, cohort_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
         ON CONFLICT (handle, platform) DO UPDATE SET
           profile_url = EXCLUDED.profile_url,
           name = EXCLUDED.name,
           niche = EXCLUDED.niche,
           why_relevant = EXCLUDED.why_relevant,
           follower_count = COALESCE(EXCLUDED.follower_count, culture_creators.follower_count),
           country_relevance = EXCLUDED.country_relevance,
           example_video_urls = (
             SELECT array_agg(DISTINCT u)
               FROM unnest(culture_creators.example_video_urls || EXCLUDED.example_video_urls) AS u
           ),
           tags = (
             SELECT array_agg(DISTINCT t)
               FROM unnest(culture_creators.tags || EXCLUDED.tags) AS t
           ),
           cohort_date = EXCLUDED.cohort_date,
           discovered_at = NOW()`,
        [
          c.handle,
          c.platform,
          verifiedProfile,
          c.name,
          c.niche,
          c.whyRelevant,
          c.followerCount,
          c.countryRelevance,
          verifiedVideos,
          c.tags,
          lens,
          today,
        ],
      )
      inserted++
    } catch (err) {
      console.error('[creator-radar] insert failed for', c.handle, err)
    }
  }

  return inserted
}

export async function getTodaysCohort(): Promise<Array<{
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
  cohort_date: string
}>> {
  const rows = (await sql().query(
    `SELECT handle, platform, profile_url, name, niche, why_relevant,
            follower_count, country_relevance, example_video_urls, tags,
            cohort_date::TEXT AS cohort_date
       FROM culture_creators
      WHERE status = 'active'
      ORDER BY cohort_date DESC NULLS LAST, discovered_at DESC
      LIMIT 25`,
  )) as Array<{
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
    cohort_date: string
  }>
  return rows
}
