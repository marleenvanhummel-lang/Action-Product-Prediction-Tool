/**
 * Action Fit score — "should Action care?"
 *
 * Inputs are the trend's category, country relevance, vibe, subculture,
 * and lifecycle stage. Outputs a total 0-100 plus a per-market score
 * so the trust panel can show Action's NL fit vs DE fit etc.
 *
 * Brand-voice fit is approximated from vibe + subculture; a future
 * iteration can replace that with a Gemini classifier against the
 * JackandAI brand voice rules.
 */

import { WEIGHTS } from './weights'
import type { ActionFitScore, ActionFitBreakdown } from '@/types/scoring'

/** Action's 14 markets. */
export const ACTION_MARKETS = [
  'NL','BE','FR','DE','AT','CH','ES','IT','PT','PL','CZ','SK','HU','RO',
] as const

export type ActionMarket = (typeof ACTION_MARKETS)[number]

/**
 * Map Culture Radar categories to Action's product range strength.
 * Full match scores 35; adjacent categories score lower; misses score 0.
 *
 * [ASSUMPTION] Mapping is editorial and should be reviewed by Action
 * marketing periodically. Stored in `lib/taxonomy/action-categories.ts`
 * for easier maintenance once that file lands.
 */
const CATEGORY_MATCH: Record<string, number> = {
  food: 35,
  beauty: 32,
  home: 35,
  lifestyle: 30,
  fashion: 28,
  tech: 18,
  sound: 12,
  meme: 10,
  culture: 14,
  platform: 8,
}

/**
 * Vibe / subculture → audience fit. Tuned for Action's audience (broad
 * mainstream + Gen Z + parents).
 */
const VIBE_AUDIENCE: Record<string, number> = {
  product: 10,
  wholesome: 9,
  aesthetic: 8,
  humor: 7,
  informational: 7,
  emotional: 5,
  unhinged: 4,
  sport: 6,
}

/**
 * Brand-voice fit. JackandAI tone (anti-corporate, transparent, playful)
 * sits comfortably with these vibes.
 */
const VIBE_BRAND_VOICE: Record<string, number> = {
  unhinged: 18,   // brainrot, internet humor, JackandAI's wheelhouse
  humor: 17,
  aesthetic: 14,
  wholesome: 12,
  product: 15,
  emotional: 10,
  informational: 11,
  sport: 13,
}

export interface ActionFitInputs {
  category: string
  countryRelevance: string[]   // ISO codes
  vibe: string | null
  lifecycleStage: 'emerging' | 'climbing' | 'peak' | 'declining' | 'dormant' | null
}

export function computeActionFit(inputs: ActionFitInputs): ActionFitScore {
  const w = WEIGHTS.actionFit

  // 1. Category match
  const categoryMatch = Math.min(
    w.categoryMatchMax,
    CATEGORY_MATCH[inputs.category] ?? 0,
  )

  // 2. Market overlap with Action's 14 markets
  const overlap = inputs.countryRelevance.filter((c) =>
    (ACTION_MARKETS as readonly string[]).includes(c.toUpperCase()),
  )
  const marketOverlap = Math.min(
    w.marketOverlapMax,
    overlap.length * w.marketOverlapPerMatch,
  )

  // 3. Brand-voice fit
  const brandVoice = inputs.vibe
    ? Math.min(w.brandVoiceMax, VIBE_BRAND_VOICE[inputs.vibe] ?? 8)
    : 8

  // 4. Audience match
  const audience = inputs.vibe
    ? Math.min(w.audienceMax, VIBE_AUDIENCE[inputs.vibe] ?? 5)
    : 5

  // 5. Lifecycle
  const lifecycle = inputs.lifecycleStage
    ? w.lifecycleByStage[inputs.lifecycleStage] ?? 5
    : 5

  const breakdown: ActionFitBreakdown = {
    categoryMatch,
    marketOverlap,
    brandVoice,
    audience,
    lifecycle,
  }
  const total = Math.min(
    100,
    Object.values(breakdown).reduce((a, b) => a + b, 0),
  )

  // Per-market score: recompute with overlap = 1 (just that market)
  const byMarket: Record<string, number> = {}
  for (const market of ACTION_MARKETS) {
    const isPresent = inputs.countryRelevance.some(
      (c) => c.toUpperCase() === market,
    )
    const marketSpecificOverlap = isPresent ? w.marketOverlapPerMatch : 0
    const marketSpecificTotal =
      categoryMatch + marketSpecificOverlap + brandVoice + audience + lifecycle
    byMarket[market] = Math.min(100, marketSpecificTotal)
  }

  return { total, breakdown, byMarket }
}

/**
 * Pick the markets where Action should activate. Top 3 markets above 50.
 */
export function pickRecommendedMarkets(fit: ActionFitScore): string[] {
  return Object.entries(fit.byMarket)
    .filter(([, score]) => score >= 50)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([market]) => market)
}
