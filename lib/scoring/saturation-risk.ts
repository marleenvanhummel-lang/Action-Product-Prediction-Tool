/**
 * Saturation risk — "is this past peak?"
 *
 * Uses lifecycle stage + days-since-peak from snapshots.
 * Returns 0-100. Higher = more saturated (avoid).
 */

import { WEIGHTS } from './weights'

type LifecycleStage =
  | 'emerging'
  | 'climbing'
  | 'peak'
  | 'declining'
  | 'dormant'

export function computeSaturationRisk(
  lifecycleStage: LifecycleStage | null,
  daysSincePeak: number | null,
): number | null {
  if (lifecycleStage == null) return null
  const base = WEIGHTS.saturation.byStage[lifecycleStage] ?? 50
  const peakBonus = daysSincePeak == null
    ? 0
    : Math.min(
        WEIGHTS.saturation.daysSincePeakCap,
        daysSincePeak * WEIGHTS.saturation.daysSincePeakPerDay,
      )
  return Math.min(100, base + peakBonus)
}
