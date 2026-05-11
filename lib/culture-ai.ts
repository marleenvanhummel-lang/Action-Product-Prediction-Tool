/**
 * Culture Radar — AI analysis layer.
 *
 * Wraps Gemini 2.5 Flash to extract structured trends from scraped source
 * content. Keeps the prompt + parsing in one place so it can be tweaked
 * without touching API routes.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'
import { extractJson } from '@/lib/culture-radar'
import type {
  AIAnalysisResult,
  AIIdentifiedTrend,
  CultureCategory,
} from '@/types/culture'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

const VALID_CATEGORIES: CultureCategory[] = [
  'food',
  'beauty',
  'fashion',
  'home',
  'lifestyle',
  'tech',
  'meme',
  'culture',
  'platform',
  'sound',
]

const VALID_CONTENT_TYPES = [
  'hashtag',
  'format',
  'sound',
  'aesthetic',
  'behavior',
  'meme',
]

/**
 * Ask Gemini to identify trends in scraped content from a single source.
 * Returns up to `maxTrends` items per source. Filters invalid categories
 * / content types defensively.
 */
export async function analyzeSourceContent(args: {
  sourceName: string
  sourceCategory: CultureCategory
  sourceUrl: string
  contentMarkdown: string
  maxTrends?: number
  lookbackDays?: number
}): Promise<AIAnalysisResult> {
  const { sourceName, sourceCategory, sourceUrl, contentMarkdown } = args
  const maxTrends = args.maxTrends ?? 8
  const lookbackDays = args.lookbackDays ?? 0

  const trimmed = contentMarkdown.slice(0, 12_000)

  const windowDescription =
    lookbackDays > 0
      ? `the last ${lookbackDays} days (this is a one-time backfill, so include anything that was trending at any point during that window)`
      : 'the current week (skip anything that already peaked or is evergreen)'

  const prompt = `You are a cultural trend analyst. Extract SPECIFIC, NAMED trends from scraped content.

# SOURCE
Name: ${sourceName}
Category: ${sourceCategory}
URL: ${sourceUrl}

# CONTENT (truncated)
${trimmed}

# TASK
Identify up to ${maxTrends} distinct cultural trends from the content above.
Window: ${windowDescription}.

# CRITICAL: SPECIFICITY RULES
Every trend MUST be specific and named. Generic category names are REJECTED.

BAD (too generic — do not return these):
- "Viral TikTok Sounds" → describes all of TikTok
- "Beauty Trends" → describes a whole category
- "Food Content" → meaningless
- "Popular Hashtags" → not a trend

GOOD (specific and named):
- "Lorde's 'What Was That' used for dramatic reveal formats" — specific song + format
- "Glazed donut nails" — specific named aesthetic
- "Day-in-my-life as a [job] POV" — specific content format with a pattern
- "Cowboy core fashion aesthetic" — named trend with clear visual identity
- "Dubai chocolate bar craze" — specific product trend with name

RULE: If you cannot give it a specific name that someone could Google and find — skip it.

# FIELDS PER TREND
- name: specific label (e.g. "Strawberry girl summer aesthetic", not "summer aesthetics")
- description: 2-3 sentences: (1) what it looks like specifically, (2) who's doing it, (3) why NOW
- category: ONE of [${VALID_CATEGORIES.join(', ')}]
- contentType: ONE of [${VALID_CONTENT_TYPES.join(', ')}]
- hashtags: specific hashtags seen in the content WITH # prefix
- popularityScore: integer 1-10, signal strength in THIS source
- reasoning: 1 sentence with a concrete signal (view count, post volume, rank position)
- estimatedViews: human-readable if available (e.g. "2.3M posts", "#3 trending NL", "59K posts/7d")
- exampleUrls: URLs from the content linking to examples

# OUTPUT
Valid JSON only, no markdown fences:

{
  "trends": [
    { "name": "...", "description": "...", "category": "...", "contentType": "...",
      "hashtags": ["#..."], "popularityScore": 7, "reasoning": "...",
      "estimatedViews": "...", "exampleUrls": ["..."] }
  ]
}

If the content contains no specific named trends, return { "trends": [] }.`

  const model = genAI.getGenerativeModel({
    model: CULTURE_GEMINI_MODEL,
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const usage = result.response.usageMetadata

  const parsed = extractJson<{ trends?: unknown }>(text)
  const rawTrends = Array.isArray(parsed?.trends) ? parsed.trends : []

  const trends: AIIdentifiedTrend[] = rawTrends
    .filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object')
    .map((t) => normalizeTrend(t, sourceCategory))
    .filter((t): t is AIIdentifiedTrend => t !== null)

  return {
    trends,
    modelUsed: CULTURE_GEMINI_MODEL,
    tokensIn: usage?.promptTokenCount,
    tokensOut: usage?.candidatesTokenCount,
  }
}

function normalizeTrend(
  raw: Record<string, unknown>,
  fallbackCategory: CultureCategory,
): AIIdentifiedTrend | null {
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null

  const description =
    typeof raw.description === 'string' ? raw.description.trim() : ''
  if (!description) return null

  // Reject generic, non-specific "trends" that are really just categories.
  if (isGenericTrendName(name) || isGenericDescription(description)) {
    return null
  }

  const category = isCategory(raw.category) ? raw.category : fallbackCategory
  const contentType = isContentType(raw.contentType) ? raw.contentType : 'format'

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .filter((h): h is string => typeof h === 'string')
        .map((h) => (h.startsWith('#') ? h : `#${h}`))
    : []

  const popularityScore = clampInt(
    typeof raw.popularityScore === 'number' ? raw.popularityScore : 5,
    1,
    10,
  )

  const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : ''
  const estimatedViews =
    typeof raw.estimatedViews === 'string' ? raw.estimatedViews : undefined
  const exampleUrls = Array.isArray(raw.exampleUrls)
    ? raw.exampleUrls.filter((u): u is string => typeof u === 'string')
    : undefined

  return {
    name,
    description,
    category,
    contentType,
    hashtags,
    popularityScore,
    reasoning,
    estimatedViews,
    exampleUrls,
  }
}

function isCategory(v: unknown): v is CultureCategory {
  return typeof v === 'string' && VALID_CATEGORIES.includes(v as CultureCategory)
}

function isContentType(v: unknown): v is AIIdentifiedTrend['contentType'] {
  return typeof v === 'string' && VALID_CONTENT_TYPES.includes(v)
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

// ── Generic trend filter ────────────────────────────────────────────────────
//
// Even with the "demand specificity" prompt, Gemini occasionally extracts
// category-level labels like "Viral TikTok Sounds" or "Beauty Trends".
// These are useless — they describe a platform, not a trend. We reject
// them here before they hit the DB.

const GENERIC_NAME_PREFIXES = [
  'viral',
  'trending',
  'popular',
  'top ',
  'latest',
  'rising',
  'emerging',
  'best',
  'biggest',
  'most',
  'new',
  'hot',
  'recent',
]

// Names that are JUST a generic noun (no specific identifier).
const GENERIC_NOUN_NAMES = new Set([
  'sounds',
  'audio',
  'music',
  'songs',
  'memes',
  'trends',
  'content',
  'posts',
  'videos',
  'reels',
  'shorts',
  'aesthetics',
  'formats',
  'challenges',
  'dances',
  'hashtags',
])

function isGenericTrendName(name: string): boolean {
  const norm = name.toLowerCase().trim()
  if (!norm) return true

  // Reject if name starts with a vague modifier and contains a category word.
  for (const prefix of GENERIC_NAME_PREFIXES) {
    if (norm.startsWith(prefix + ' ') || norm === prefix.trim()) {
      const rest = norm.slice(prefix.length).trim()
      // "viral tiktok sounds" → rest = "tiktok sounds" → both are platform/noun
      // "trending memes" → rest = "memes" → generic noun
      const words = rest.split(/\s+/).filter(Boolean)
      const lastWord = words[words.length - 1] ?? ''
      if (GENERIC_NOUN_NAMES.has(lastWord)) return true
      // Just "viral memes" / "viral sounds" / "viral songs"
      if (words.length <= 2 && words.every((w) => GENERIC_NOUN_NAMES.has(w) || PLATFORM_WORDS.has(w))) {
        return true
      }
    }
  }

  // Bare generic noun: "Memes", "Trends", "Sounds"
  const words = norm.split(/\s+/).filter(Boolean)
  if (words.length === 1 && GENERIC_NOUN_NAMES.has(words[0])) return true

  // Two-word names where both are platform/generic: "TikTok Memes", "Reels Trends"
  if (words.length === 2 && words.every((w) => GENERIC_NOUN_NAMES.has(w) || PLATFORM_WORDS.has(w))) {
    return true
  }

  return false
}

const PLATFORM_WORDS = new Set([
  'tiktok',
  'instagram',
  'reels',
  'shorts',
  'youtube',
  'twitter',
  'x',
  'threads',
  'pinterest',
  'snapchat',
  'social',
  'media',
])

// Descriptions that just define a category instead of describing a trend.
// We flag them by looking for telltale "definitional" phrasing combined with
// no specific named entities (no quoted strings, no hashtags, no creator names).
function isGenericDescription(desc: string): boolean {
  const norm = desc.toLowerCase()
  const definitionalPhrases = [
    'audio clips and music tracks',
    'content that gains popularity',
    'driving engagement and content creation',
    'primary driver of social media',
    'widespread popularity on social media',
    'a category of',
    'a type of content',
    'general trend of',
  ]
  const looksDefinitional = definitionalPhrases.some((p) => norm.includes(p))
  if (!looksDefinitional) return false

  // If it has any hashtag or quoted string or '@' mention, it has at least
  // one specific anchor — let it through.
  const hasAnchor =
    /["“][^"”]{2,}["”]/.test(desc) ||
    /#\w{3,}/.test(desc) ||
    /@\w{3,}/.test(desc) ||
    // Title-cased multi-word name (e.g. "Charli XCX", "Rebecca Black")
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+/.test(desc)
  return !hasAnchor
}
