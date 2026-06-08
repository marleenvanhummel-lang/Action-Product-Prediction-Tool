/**
 * Runtime validation schemas for vNext scoring + decision payloads.
 *
 * Used at the API boundary in `/api/culture/v2/*` so malformed clients
 * fail fast with a clear error message instead of corrupting state.
 *
 * We use a minimal hand-rolled validator instead of pulling Zod into
 * the runtime bundle. Each validator returns either `{ ok: true, value }`
 * or `{ ok: false, error }`.
 */

import type { DecisionState } from '@/types/decision'

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const DECISION_STATES: DecisionState[] = [
  'monitor', 'validate', 'test', 'activate', 'measure', 'archive',
]

export interface DecisionTransitionBody {
  trendId: string
  toState: DecisionState
  rationale?: string
  actor?: string
}

export function parseDecisionTransition(
  raw: unknown,
): ParseResult<DecisionTransitionBody> {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'body must be an object' }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.trendId !== 'string' || !isUuid(o.trendId)) {
    return { ok: false, error: 'trendId must be a UUID string' }
  }
  if (typeof o.toState !== 'string' || !DECISION_STATES.includes(o.toState as DecisionState)) {
    return {
      ok: false,
      error: `toState must be one of: ${DECISION_STATES.join(', ')}`,
    }
  }
  if (o.rationale !== undefined && typeof o.rationale !== 'string') {
    return { ok: false, error: 'rationale must be a string when provided' }
  }
  if (o.actor !== undefined && typeof o.actor !== 'string') {
    return { ok: false, error: 'actor must be a string when provided' }
  }

  return {
    ok: true,
    value: {
      trendId: o.trendId,
      toState: o.toState as DecisionState,
      rationale: o.rationale as string | undefined,
      actor: o.actor as string | undefined,
    },
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}
