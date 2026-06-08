/**
 * Confidence score — "is this trend real?"
 *
 * Returns a 0-100 explainable score with a six-factor breakdown.
 * Pure function: same inputs always produce the same output.
 *
 * See `docs/culture-radar-vnext-prd.md` section 7.1 for the formula and
 * the rationale behind the weight choices.
 */

import { WEIGHTS, WEIGHTS_VERSION } from './weights'
import type { ConfidenceBreakdown, ConfidenceScore } from '@/types/scoring'

export interface ConfidenceInputs {
  sources: Array<{
    category: string         // e.g. 'blog', 'platform', 'reddit'
    reliability: number      // 1-5
  }>
  countryRelevance: string[]
  articleDateVerdict: 'fresh' | 'inconclusive' | 'stale' | null
  manualValidationStatus: 'pending' | 'approved' | 'rejected' | null
  verifierA: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
  verifierB: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
}

/**
 * Compute confidence. Bounded 0-100. Inputs are pre-filtered:
 * - `sources` should already exclude inactive sources
 * - `countryRelevance` should already be deduped + validated codes
 */
export function computeConfidence(inputs: ConfidenceInputs): ConfidenceScore {
  const w = WEIGHTS.confidence

  // Source diversity: count distinct source categories
  const distinctCategories = new Set(inputs.sources.map((s) => s.category)).size
  const sourceDiversity = Math.min(
    w.sourceDiversityMax,
    distinctCategories * w.sourceDiversityPerCategory,
  )

  // Source reliability: mean reliability scaled to 0-25
  const meanReliability = inputs.sources.length
    ? inputs.sources.reduce((acc, s) => acc + clampReliability(s.reliability), 0) /
      inputs.sources.length
    : 0
  const sourceReliability = Math.min(
    w.sourceReliabilityMax,
    Math.round(meanReliability * w.sourceReliabilityScale),
  )

  // Cross-country spread
  const crossCountrySpread = Math.min(
    w.crossCountryMax,
    inputs.countryRelevance.length * w.crossCountryPerMarket,
  )

  // Article-date freshness
  const articleDateFreshness =
    inputs.articleDateVerdict === 'fresh'
      ? w.articleDateMax
      : inputs.articleDateVerdict === 'inconclusive'
        ? Math.round(w.articleDateMax * 0.53) // 8 / 15
        : 0

  // Manual validation
  const manualValidation =
    inputs.manualValidationStatus === 'approved'
      ? w.manualValidationMax
      : inputs.manualValidationStatus === 'pending'
        ? Math.round(w.manualValidationMax * 0.5)
        : 0

  // Verifier agreement (dual Gemini pass)
  const verifierAgreement =
    inputs.verifierA === 'real' && inputs.verifierB === 'real'
      ? w.verifierAgreementMax
      : inputs.verifierA === 'real' || inputs.verifierB === 'real'
        ? Math.round(w.verifierAgreementMax * 0.4) // 2/5
        : 0

  const breakdown: ConfidenceBreakdown = {
    sourceDiversity,
    sourceReliability,
    crossCountrySpread,
    articleDateFreshness,
    manualValidation,
    verifierAgreement,
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0)

  return {
    total: Math.min(100, total),
    breakdown,
    computedAt: new Date().toISOString(),
    inputsHash: hashInputs(inputs),
  }
}

function clampReliability(r: number): number {
  if (!Number.isFinite(r) || r < 1) return 1
  if (r > 5) return 5
  return r
}

/**
 * Deterministic hash of inputs for drift detection. Not a security hash;
 * we just want to know if any input changed between two compute runs.
 * FNV-1a over a stable JSON serialisation.
 */
function hashInputs(inputs: ConfidenceInputs): string {
  const stable = JSON.stringify({
    s: [...inputs.sources]
      .map((s) => `${s.category}:${s.reliability}`)
      .sort(),
    c: [...inputs.countryRelevance].sort(),
    a: inputs.articleDateVerdict,
    m: inputs.manualValidationStatus,
    va: inputs.verifierA,
    vb: inputs.verifierB,
  })
  let h = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    h ^= stable.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return `${WEIGHTS_VERSION}-${h.toString(16)}`
}
