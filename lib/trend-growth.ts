/**
 * Predictive growth score (0-10).
 *
 * Aim: estimate the probability a trend will GROW BIGGER in the next 14
 * days. NOT a measure of current size — that's popularityScore. This is
 * forward-looking.
 *
 * Inputs (all already in the DB, no external calls):
 *   freshnessScore   how recently we picked it up (0-10)
 *   validationScore  how many independent sources confirmed it
 *   popularityScore  current size (used in INVERSE — already-mainstream
 *                    trends have less growth runway)
 *   firstSeenAt      age in days
 *   sourceNames      cross-platform check (TikTok + Reddit + Newsletter
 *                    = stronger signal than one platform only)
 *   subculture       trends originating in a tracked subculture have
 *                    higher base rate of breaking mainstream
 *   vibe             "unhinged" trends grow fast then crash;
 *                    "informational" trends rarely break out
 *
 * Composite formula — opinionated, designed to surface ~10-15% of the
 * dataset as "likely to grow". Scale 0-10.
 *
 *   freshness  weight 0.20
 *   validation weight 0.20  (multi-source = signal)
 *   pre-peak   weight 0.20  (currentSize 4-7 = sweet spot)
 *   age window weight 0.15  (3-21 days old = climbing phase)
 *   cross-platform weight 0.10
 *   subculture weight 0.10
 *   vibe bonus weight 0.05
 */

import type { CultureTrend } from '@/types/culture'

interface GrowthInput {
  freshnessScore: number
  validationScore: number
  popularityScore: number
  firstSeenAt: string | null
  sourceNames: string[]
  subculture: string | null
  vibe: CultureTrend['vibe']
}

/**
 * Compute a 0-10 growth score. Pure function — given the same inputs
 * always returns the same output. Safe to call inline in the trend
 * extraction pipeline AND in a backfill cron.
 */
export function computeGrowthScore(t: GrowthInput): number {
  // 1. freshness: 0-10 directly
  const freshness = clamp(t.freshnessScore, 0, 10)

  // 2. validation: 2+ sources is good, >3 doesn't add much more
  const validation = clamp(t.validationScore, 0, 5) * 2   // → 0-10

  // 3. pre-peak score: currentSize 4-7 is the sweet spot. Below 4 =
  //    might not be real. Above 7 = already mainstream, less runway.
  let prePeak: number
  if (t.popularityScore < 3) prePeak = 4
  else if (t.popularityScore <= 5) prePeak = 8
  else if (t.popularityScore <= 7) prePeak = 10
  else if (t.popularityScore <= 8) prePeak = 6
  else prePeak = 3

  // 4. age window: 3-21 days = climbing phase. <3 = too noisy. >21 = past peak.
  let ageWindow: number
  if (!t.firstSeenAt) {
    ageWindow = 5
  } else {
    const days = Math.max(0, (Date.now() - new Date(t.firstSeenAt).getTime()) / 86_400_000)
    if (days < 2) ageWindow = 6
    else if (days < 7) ageWindow = 10
    else if (days < 14) ageWindow = 8
    else if (days < 21) ageWindow = 6
    else if (days < 35) ageWindow = 3
    else ageWindow = 1
  }

  // 5. cross-platform: distinct platform-class sources
  const platforms = new Set<string>()
  for (const n of t.sourceNames) {
    const low = n.toLowerCase()
    if (low.includes('tiktok')) platforms.add('tiktok')
    else if (low.includes('reddit')) platforms.add('reddit')
    else if (low.includes('youtube')) platforms.add('youtube')
    else if (low.includes('instagram') || low.includes('reels')) platforms.add('ig')
    else if (low.includes('newsletter') || low.includes('garbage day') || low.includes('substack')) platforms.add('newsletter')
    else if (low.includes('perplexity')) platforms.add('perplexity')
    else if (low.includes('google trends')) platforms.add('search')
    else platforms.add('other')
  }
  const crossPlatform = clamp(platforms.size, 0, 4) * 2.5    // → 0-10

  // 6. subculture bonus: trends from tracked subcultures often percolate
  //    out. Brainrot subcultures get a higher multiplier (faster growth).
  let subcultureBonus = 0
  if (t.subculture) {
    subcultureBonus = 6
    if (t.subculture === 'italian_brainrot' || t.subculture === 'gen_alpha_brainrot' || t.subculture === 'ohio_culture') {
      subcultureBonus = 9
    }
  }

  // 7. vibe heuristic
  let vibeBonus = 5
  if (t.vibe === 'unhinged') vibeBonus = 9            // unhinged grows fast (and crashes fast — caller decides)
  else if (t.vibe === 'aesthetic') vibeBonus = 7
  else if (t.vibe === 'humor') vibeBonus = 7
  else if (t.vibe === 'wholesome') vibeBonus = 5
  else if (t.vibe === 'emotional') vibeBonus = 5
  else if (t.vibe === 'product') vibeBonus = 4
  else if (t.vibe === 'informational') vibeBonus = 3   // news rarely breaks
  else if (t.vibe === 'sport') vibeBonus = 4

  const raw =
    freshness * 0.20 +
    validation * 0.20 +
    prePeak * 0.20 +
    ageWindow * 0.15 +
    crossPlatform * 0.10 +
    subcultureBonus * 0.10 +
    vibeBonus * 0.05

  return Math.round(clamp(raw, 0, 10) * 10) / 10  // one decimal
}

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo
  return Math.max(lo, Math.min(hi, v))
}
