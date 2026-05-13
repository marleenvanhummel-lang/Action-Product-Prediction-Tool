/**
 * Trend vibe classifier.
 *
 * Tags each trend with a "vibe" — the emotional/aesthetic register it
 * lives in. Lets us filter for "show me only the unhinged stuff" or
 * "show me the wholesome stuff" on the dashboard.
 *
 * Vibes:
 *   unhinged       chaotic, absurd, surreal, brainrot, low-fi humor,
 *                  shitposts, weirdcore, italian brainrot, skibidi,
 *                  gen alpha slop, AI fever dreams, ohio rizz
 *   aesthetic      curated visual identity — cottagecore, dark academia,
 *                  clean girl, mob wife, glass skin, coquette
 *   humor          clever/witty/relatable observational comedy (NOT
 *                  chaotic absurd — that's unhinged)
 *   wholesome      earnest, kind, uplifting, sincere
 *   emotional      vulnerable storytelling, grief, longing,
 *                  introspection, romantic
 *   informational  news, explainer, how-to, educational, expert
 *                  takes, current events
 *   product        product launches, retail drops, brand campaigns
 *   sport          sports-led
 *
 * If none clearly fit, return null and the UI will show the trend
 * under "unclassified".
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'
import { extractJson } from '@/lib/culture-radar'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

export const VIBES = [
  'unhinged',
  'aesthetic',
  'humor',
  'wholesome',
  'emotional',
  'informational',
  'product',
  'sport',
] as const

export type Vibe = typeof VIBES[number]

export interface VibeInferInput {
  id: string
  name: string
  description: string
  category: string
  hashtags: string[]
}

export interface VibeInferResult {
  id: string
  vibe: Vibe | null
}

export async function inferVibes(trends: VibeInferInput[]): Promise<VibeInferResult[]> {
  if (trends.length === 0) return []

  const prompt = buildPrompt(trends)
  const model = genAI.getGenerativeModel({
    model: CULTURE_GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  })

  const result = await model.generateContent(prompt)
  const text = result.response.text()
  const parsed = extractJson<{ results?: unknown }>(text)
  const rawResults = Array.isArray(parsed?.results) ? parsed.results : []

  const byId = new Map<string, VibeInferResult>()
  for (const raw of rawResults) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : null
    if (!id) continue
    const vibeRaw = typeof r.vibe === 'string' ? r.vibe.toLowerCase() : null
    const vibe = vibeRaw && (VIBES as readonly string[]).includes(vibeRaw) ? (vibeRaw as Vibe) : null
    byId.set(id, { id, vibe })
  }

  return trends.map((t) => byId.get(t.id) ?? { id: t.id, vibe: null })
}

function buildPrompt(trends: VibeInferInput[]): string {
  const list = trends
    .map((t, i) =>
      `${i + 1}. ID: ${t.id}
   NAME: ${t.name}
   CATEGORY: ${t.category}
   DESCRIPTION: ${t.description.slice(0, 280)}
   ${t.hashtags.length > 0 ? `HASHTAGS: ${t.hashtags.slice(0, 6).join(' ')}` : ''}`,
    )
    .join('\n\n')

  return `Classify each trend below into ONE of these "vibes" (the emotional/aesthetic register):

- "unhinged"      chaotic, absurd, surreal humor. Italian brainrot
                  (tralalero tralala, ballerina cappuccina, lirili larila),
                  skibidi toilet, ohio rizz, gen alpha slop, weirdcore,
                  AI fever dreams, shitposts, no-filter chaos, fake-deep
                  irony, slop edits, Lookmax-style ragebait. If a trend
                  sounds like it shouldn't make sense, it's unhinged.
- "aesthetic"     curated visual identity — cottagecore, dark academia,
                  clean girl, mob wife, glass skin, coquette, alt fashion
                  movements, vibe-as-product
- "humor"         clever/witty/relatable observational comedy — NOT
                  chaotic absurd. Stand-up clips, relatable bits,
                  POV format comedy, "people in my city" humor
- "wholesome"     earnest, kind, uplifting, sincere — small acts, family
                  moments, gratitude posts, soft pet content
- "emotional"     vulnerable storytelling — grief, longing, breakups,
                  introspection, romantic POV
- "informational" news, explainers, how-tos, educational, expert takes,
                  current events analysis, debunking, science
- "product"       product launches, retail drops, brand campaigns,
                  shopping-led content
- "sport"         sports-led content, football/tennis/etc. matches,
                  athlete moments

Rules:
- Pick ONE vibe per trend. If the trend mixes multiple, pick the
  DOMINANT one — what would a viewer say after 5 seconds?
- "Italian brainrot", "skibidi", "ohio", "delulu", "fanum tax",
  "rizz", "tralalero", "ballerina cappuccina", "AI-generated weird
  music videos" → ALWAYS "unhinged".
- Aesthetic + product fusion (e.g. "Glass Skin Effect Dior Stick") →
  "aesthetic" if the trend is about the look, "product" if it's about
  the launch.
- If genuinely none fit, return "vibe": null.

Trends to classify:

${list}

Return JSON in this exact shape:
{
  "results": [
    { "id": "<trend id>", "vibe": "unhinged|aesthetic|humor|wholesome|emotional|informational|product|sport|null" },
    ...
  ]
}
`
}
