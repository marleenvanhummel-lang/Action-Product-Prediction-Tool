/**
 * Trend lifecycle stage detection from timeseries snapshots.
 *
 * Classifies each trend into one of:
 *   - emerging  : young + popularity climbing
 *   - climbing  : sustained growth across multiple days
 *   - peak     : plateaued at top of its curve
 *   - declining: popularity dropping after peak
 *   - dormant  : low popularity, no recent growth
 *
 * Inputs: ordered popularity snapshots from culture_trend_snapshots.
 * Pure function — no DB, no AI. Cheap.
 */

export type LifecycleStage = 'emerging' | 'climbing' | 'peak' | 'declining' | 'dormant'

export interface LifecycleInput {
  firstSeenAt: string | null
  snapshots: Array<{ date: string; popularity: number }>   // chronological
}

export interface LifecycleOutput {
  stage: LifecycleStage
  daysObserved: number
  peakPopularity: number
  currentPopularity: number
  daysSincePeak: number | null
  trendDirection: 'up' | 'flat' | 'down'   // recent 3-day slope
  confidence: 'high' | 'medium' | 'low'    // depends on snapshot count
}

export function detectLifecycleStage(input: LifecycleInput): LifecycleOutput {
  const snaps = [...input.snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const n = snaps.length

  // No data → use firstSeenAt + a generic dormant guess
  if (n === 0) {
    return {
      stage: 'dormant',
      daysObserved: 0,
      peakPopularity: 0,
      currentPopularity: 0,
      daysSincePeak: null,
      trendDirection: 'flat',
      confidence: 'low',
    }
  }

  const current = snaps[n - 1].popularity
  let peak = -Infinity
  let peakIdx = 0
  for (let i = 0; i < n; i++) {
    if (snaps[i].popularity > peak) {
      peak = snaps[i].popularity
      peakIdx = i
    }
  }
  const daysSincePeak = (n - 1) - peakIdx
  const daysObserved = n

  // Recent 3-day direction
  let direction: 'up' | 'flat' | 'down' = 'flat'
  if (n >= 3) {
    const recent = snaps.slice(-3).map((s) => s.popularity)
    const delta = recent[2] - recent[0]
    if (delta >= 1) direction = 'up'
    else if (delta <= -1) direction = 'down'
  }

  // Confidence based on number of snapshots
  const confidence: 'high' | 'medium' | 'low' =
    n >= 7 ? 'high' : n >= 3 ? 'medium' : 'low'

  // Classification rules
  let stage: LifecycleStage
  const ageDays = input.firstSeenAt
    ? Math.max(0, (Date.now() - new Date(input.firstSeenAt).getTime()) / 86_400_000)
    : daysObserved

  if (current < 4 && peak < 5 && direction !== 'up') {
    stage = 'dormant'
  } else if (ageDays < 3 && direction === 'up') {
    stage = 'emerging'
  } else if (direction === 'up' && current >= 5) {
    stage = 'climbing'
  } else if (daysSincePeak >= 3 && direction === 'down') {
    stage = 'declining'
  } else if (current >= peak - 1 && daysSincePeak <= 2) {
    stage = 'peak'
  } else if (direction === 'down') {
    stage = 'declining'
  } else {
    stage = 'climbing'
  }

  return {
    stage,
    daysObserved,
    peakPopularity: peak,
    currentPopularity: current,
    daysSincePeak: peak > 0 ? daysSincePeak : null,
    trendDirection: direction,
    confidence,
  }
}
