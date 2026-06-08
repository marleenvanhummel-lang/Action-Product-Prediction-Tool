/**
 * Culture Radar vNext type shapes.
 *
 * These extend (not replace) the v1 types in `types/culture.ts` during
 * the migration window. v2 endpoints return the extended shape; v1
 * clients ignore unknown fields.
 */

import type { CultureTrend } from './culture'
import type {
  DecisionState,
  RecommendedAction,
  SpeedToActivation,
  ManualValidationStatus,
  ArticleDateVerdict,
} from './decision'
import type { ConfidenceBreakdown } from './scoring'

export interface CultureTrendVNext extends CultureTrend {
  // Trust layer (Pillar 2)
  confidenceScore: number | null
  confidenceBreakdown: ConfidenceBreakdown | null
  validationDiversityScore: number | null
  validationReliabilityScore: number | null
  articleDateVerdict: ArticleDateVerdict | null
  manualValidationStatus: ManualValidationStatus
  manualValidationReviewer: string | null
  manualValidationRationale: string | null
  manualValidationDecidedAt: string | null

  // Decision layer (Pillar 3)
  actionFitScore: number | null
  commercialRelevanceScore: number | null
  creativeRelevanceScore: number | null
  breakoutProbability: number | null
  saturationRisk: number | null
  speedToActivation: SpeedToActivation | null
  recommendedAction: RecommendedAction | null
  recommendedMarket: string[]
  actionFitByMarket: Record<string, number> | null

  // Workflow (Pillar 4)
  decisionState: DecisionState
  decisionOwner: string | null
  decisionUpdatedAt: string | null

  // Taxonomy (Pillar 1)
  subcultureId: number | null
}

export interface TrustPanelData {
  confidence: {
    total: number | null
    breakdown: ConfidenceBreakdown | null
  }
  sources: Array<{
    id: number
    name: string
    reliability: number
    sourceType: string
    lastSeen: string | null
  }>
  verifier: {
    a: { verdict: string | null; reasoning: string | null }
    b: { verdict: string | null; reasoning: string | null }
  }
  articleDate: {
    verdict: ArticleDateVerdict | null
  }
  manualValidation: {
    status: ManualValidationStatus
    reviewer: string | null
    rationale: string | null
    decidedAt: string | null
  }
  crossCountrySignal: {
    markets: string[]
    platforms: string[]
  }
}

export interface SystemHealth {
  ageHours: number | null
  stale: boolean
  degraded: boolean
  lastRun: {
    started_at: string
    finished_at: string | null
    sources_attempted: number
    sources_ok: number
    sources_failed: number
    trends_inserted: number
    status: string
  } | null
  queueDepth: number
  sourceHealth: {
    ok: number
    total: number
  }
  reviewQueueCount: number
}
