/**
 * Trend hallucination filter.
 *
 * After AI extraction (especially from Perplexity which is prone to
 * fabricating examples), single-source trends often contain noise:
 *   - Generic AI-summarized labels ("Bizarre Social Media Tales")
 *   - Fabricated usernames ("sawsay219 H2A2 Rock May 2026")
 *   - Made-up sub-trends that don't actually exist
 *
 * This module asks Gemini in a batch: "for each of these trends,
 * decide if it's a real specific named trend OR a generic / fabricated
 * AI-summary noise". Suspicious ones get flagged and archived from the
 * dashboard.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { CULTURE_GEMINI_MODEL } from '@/lib/constants'
import { extractJson } from '@/lib/culture-radar'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')

export interface VerifyInput {
  id: string
  name: string
  description: string
  hashtags: string[]
  sourceName: string
}

export interface VerifyResult {
  id: string
  verdict: 'real' | 'generic' | 'fabricated' | 'uncertain'
  reason: string
}

export async function verifyTrends(items: VerifyInput[]): Promise<VerifyResult[]> {
  if (items.length === 0) return []

  const list = items
    .map((t, i) =>
      `${i + 1}. ID: ${t.id}
   NAME: ${t.name}
   DESCRIPTION: ${t.description.slice(0, 240)}
   ${t.hashtags.length > 0 ? `HASHTAGS: ${t.hashtags.slice(0, 5).join(' ')}` : ''}
   SOURCE: ${t.sourceName}`,
    )
    .join('\n\n')

  const prompt = `You are a hallucination filter for a cultural trend tracking system.

For each "trend" below, decide if it represents a REAL, SPECIFIC, NAMED
trend that actually exists in the wild OR if it's AI-generated noise —
generic labels, fabricated usernames, made-up examples, summary-of-a-summary
content, or things that sound plausible but can't be verified.

Verdict options:
  "real"        Specific, named, verifiable. Real creator handles, real
                memes, real brand activations, real sport events.
                Examples: "#worldcup2026", "Cheesecakegate",
                "Italian Brainrot Bombardiro Crocodilo character",
                "Owala FreeSip Water Bottle viral on TikTok"
  "generic"     A general topic, category, or theme — not a specific
                trend you could point a camera at. Sounds like an AI
                summarizing a broader pattern.
                Examples: "Bizarre Social Media Tales",
                "BeautyTok niches", "Various Italian brainrot variations",
                "Fitness Content Discussion"
  "fabricated"  Sounds plausible but probably made up by an AI.
                Suspicious tells: fabricated-looking usernames (random
                alphanumeric), future dates ("May 2026 UGC trend"),
                niche-too-specific aesthetics no one has heard of
                (e.g. "Pabington Aesthetic", "Glimmerwave Core"),
                meta-references to fake creator names.
  "uncertain"   Reasonable doubt — could be real, could be noise.

RULES:
- Be CONSERVATIVE about flagging. If you've heard of it or it has
  plausible context, lean "real" or "uncertain".
- A hashtag with no surrounding context can still be real if it's
  short and plausible (#tiktokshopmemorialday, #fifaworldcup).
- Generic-but-broad categories the team would still care about (e.g.
  "Glass Skin Effect", "Clean Girl Aesthetic") = "real". They're
  documented subcultures.
- Anything with a SPECIFIC name like a creator handle, brand,
  product, sport team, event, place, person = lean "real".
- Anything that reads like "trends in X niche" or "various Y content"
  = "generic".

Trends to verify:

${list}

Return JSON:
{
  "results": [
    { "id": "<trend id>", "verdict": "real|generic|fabricated|uncertain", "reason": "<one short clause>" }
  ]
}
`

  const model = genAI.getGenerativeModel({
    model: CULTURE_GEMINI_MODEL,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  })

  try {
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    const parsed = extractJson<{ results?: unknown }>(text)
    const raw = Array.isArray(parsed?.results) ? parsed.results : []

    const byId = new Map<string, VerifyResult>()
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue
      const o = r as Record<string, unknown>
      if (typeof o.id !== 'string') continue
      const verdict = ['real', 'generic', 'fabricated', 'uncertain'].includes(o.verdict as string)
        ? (o.verdict as VerifyResult['verdict'])
        : 'uncertain'
      byId.set(o.id, {
        id: o.id,
        verdict,
        reason: typeof o.reason === 'string' ? o.reason : '',
      })
    }
    return items.map((t) => byId.get(t.id) ?? { id: t.id, verdict: 'uncertain', reason: 'no response' })
  } catch (err) {
    console.error('[trend-verify] gemini failed', err)
    return items.map((t) => ({ id: t.id, verdict: 'uncertain' as const, reason: 'gemini error' }))
  }
}
