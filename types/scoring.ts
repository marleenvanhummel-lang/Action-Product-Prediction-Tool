/**
 * Scoring shapes for Culture Radar vNext.
 *
 * All scores are explainable: every total carries a breakdown that maps
 * back to the inputs documented in the PRD section 7.
 */

export interface ConfidenceBreakdown {
  /** 0-30 — distinct source categories that confirmed */
  sourceDiversity: number
  /** 0-25 — mean reliability of the sources, scaled */
  sourceReliability: number
  /** 0-15 — cardinality of country_relevance, capped at 5 */
  crossCountrySpread: number
  /** 0-15 — fresh=15, inconclusive=8, stale=0 */
  articleDateFreshness: number
  /** 0-10 — approved=10, pending=5, rejected=0 */
  manualValidation: number
  /** 0-5 — both_real=5, one_real=2, neither=0 */
  verifierAgreement: number
}

export interface ConfidenceScore {
  total: number                // 0-100
  breakdown: ConfidenceBreakdown
  computedAt: string           // ISO timestamp
  inputsHash: string           // For drift detection on re-runs
}

export interface ActionFitBreakdown {
  /** 0-35 — category match against Action's product range */
  categoryMatch: number
  /** 0-25 — intersect(country_relevance, ACTION_MARKETS) */
  marketOverlap: number
  /** 0-20 — brand-voice fit classifier */
  brandVoice: number
  /** 0-10 — audience match (Gen Z / Millennial / parents) */
  audience: number
  /** 0-10 — lifecycle stage (peak is too late) */
  lifecycle: number
}

export interface ActionFitScore {
  total: number                // 0-100
  breakdown: ActionFitBreakdown
  byMarket: Record<string, number>  // ISO country → 0-100
}

export interface CommercialBreakdown {
  productOpportunity: number   // 0-35
  pricePoint: number           // 0-20
  basketAdjacency: number      // 0-15
  seasonalLift: number         // 0-15
  speed: number                // 0-10
  confidenceFloor: number      // 0-5
}

export interface CreativeBreakdown {
  visualDistinctness: number   // 0-30
  formatClarity: number        // 0-25
  creatorAvailability: number  // 0-20
  brandVoice: number           // 0-15
  speed: number                // 0-10
}
