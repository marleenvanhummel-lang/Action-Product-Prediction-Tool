/**
 * Culture Radar vNext · single source of truth for tunable score weights.
 *
 * Any other file using a magic number for a score weight is a regression.
 * Bump `WEIGHTS_VERSION` whenever a weight changes so downstream caches
 * can invalidate.
 */

export const WEIGHTS_VERSION = '1.0.0'

export const WEIGHTS = {
  confidence: {
    sourceDiversityMax: 30,
    sourceReliabilityMax: 25,
    crossCountryMax: 15,
    articleDateMax: 15,
    manualValidationMax: 10,
    verifierAgreementMax: 5,
    // Per-input multipliers
    sourceDiversityPerCategory: 6,   // capped at 5 categories → 30
    sourceReliabilityScale: 5,       // mean(1-5) × 5 = 0-25
    crossCountryPerMarket: 3,        // capped at 5 markets → 15
  },
  actionFit: {
    categoryMatchMax: 35,
    marketOverlapMax: 25,
    brandVoiceMax: 20,
    audienceMax: 10,
    lifecycleMax: 10,
    // Lifecycle scoring (peak is "too late")
    lifecycleByStage: {
      emerging: 10,
      climbing: 8,
      peak: 5,
      declining: 2,
      dormant: 0,
    },
    marketOverlapPerMatch: 4,        // capped at 25
  },
  commercial: {
    productOpportunityMax: 35,
    pricePointMax: 20,
    basketAdjacencyMax: 15,
    seasonalLiftMax: 15,
    speedMax: 10,
    confidenceFloorMax: 5,
  },
  creative: {
    visualDistinctnessMax: 30,
    formatClarityMax: 25,
    creatorAvailabilityMax: 20,
    brandVoiceMax: 15,
    speedMax: 10,
  },
  growth: {
    freshness: 0.20,
    sourceDiversity: 0.20,
    prePeakWindow: 0.20,
    ageWindow: 0.15,
    crossPlatform: 0.10,
    subcultureOrigin: 0.10,
    vibeBonus: 0.05,
    /** Trends with confidence below this floor get growth_score = null */
    confidenceFloor: 30,
  },
  saturation: {
    byStage: {
      emerging: 5,
      climbing: 20,
      peak: 70,
      declining: 90,
      dormant: 100,
    },
    daysSincePeakPerDay: 2,
    daysSincePeakCap: 30,
  },
} as const
