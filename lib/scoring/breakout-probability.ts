/**
 * Breakout probability — "will this break this week?"
 *
 * Wraps growth_score with a confidence multiplier so weak trends with
 * impressive heuristic growth can't dominate the Breakout magazine
 * section.
 *
 * Formula: round(growth_score × 10 × (confidence_score / 100))
 *
 * Examples:
 *   growth=9, confidence=70 → 63
 *   growth=9, confidence=30 → 27
 *   growth=5, confidence=80 → 40
 *   growth=null → null
 */

export function computeBreakoutProbability(
  growthScore: number | null,
  confidenceScore: number | null,
): number | null {
  if (growthScore == null || confidenceScore == null) return null
  const g = clamp(growthScore, 0, 10)
  const c = clamp(confidenceScore, 0, 100)
  return Math.round(g * 10 * (c / 100))
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return n < lo ? lo : n > hi ? hi : n
}
