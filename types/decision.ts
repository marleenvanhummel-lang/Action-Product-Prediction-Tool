/**
 * Decision state machine types for Culture Radar vNext.
 *
 * Replaces the use of `culture_trends.status` as a decision field.
 * `status` becomes purely lifecycle (active / archived). `decision_state`
 * tracks what the team is doing with the trend.
 */

export type DecisionState =
  | 'monitor'
  | 'validate'
  | 'test'
  | 'activate'
  | 'measure'
  | 'archive'

export type RecommendedAction =
  | 'act_content'
  | 'act_product'
  | 'act_promo'
  | 'monitor'
  | 'validate'
  | 'ignore'

export type SpeedToActivation =
  | 'now'
  | 'this_week'
  | 'this_month'
  | 'quarter'
  | 'not_actionable'

export type ManualValidationStatus = 'pending' | 'approved' | 'rejected'

export type ArticleDateVerdict = 'fresh' | 'inconclusive' | 'stale'

export interface DecisionHistoryEntry {
  id: number
  trendId: string
  fromState: DecisionState | null
  toState: DecisionState
  actor: string
  rationale: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}
