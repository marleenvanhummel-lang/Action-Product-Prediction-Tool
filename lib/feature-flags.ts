/**
 * Feature flags for the Culture Radar vNext rollout.
 *
 * Each flag is a simple env-var lookup. Default OFF in production.
 * Flip via Vercel project env vars: `FLAG_VNEXT_<NAME>=1`.
 *
 * Pattern:
 *   if (flag('VNEXT_CONFIDENCE')) {
 *     // render new disc
 *   }
 *
 * Used both server-side and client-side. On the client we read
 * `NEXT_PUBLIC_FLAG_*` mirrors so flags can be inlined at build time.
 */

export const FLAGS = [
  'VNEXT_CONFIDENCE',     // confidence disc on cards + magazine
  'VNEXT_TRUST_PANEL',    // trust panel drawer / inline
  'VNEXT_DECISION_STATE', // decision state menu on cards
  'VNEXT_MAGAZINE',       // new magazine layout (exec summary + 3-act block)
  'VNEXT_SYSTEM_BANNERS', // stale / degraded banners on dashboard
  'VNEXT_REVIEW_QUEUE',   // review queue drawer
] as const

export type FlagName = (typeof FLAGS)[number]

export function flag(name: FlagName): boolean {
  // Server-side env lookup
  if (typeof window === 'undefined') {
    const v = process.env[`FLAG_${name}`]
    return v === '1' || v === 'true'
  }
  // Client-side mirror (must be NEXT_PUBLIC_ for Next.js to inline)
  const v = process.env[`NEXT_PUBLIC_FLAG_${name}`]
  return v === '1' || v === 'true'
}

/**
 * Snapshot of all flags. Useful for debug surfaces and the system page.
 */
export function flagSnapshot(): Record<FlagName, boolean> {
  return Object.fromEntries(FLAGS.map((f) => [f, flag(f)])) as Record<
    FlagName,
    boolean
  >
}
