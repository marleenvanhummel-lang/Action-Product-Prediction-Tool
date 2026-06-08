/**
 * POST /api/culture/v2/decision
 * Transition a trend through the decision state machine.
 * Body: { trendId, toState, rationale?, actor? }
 *
 * Records the transition in culture_decision_history. Rejects invalid
 * transitions (e.g. monitor → measure) with HTTP 422 + clear message.
 *
 * Auth: write endpoint, requires Bearer (enforced by middleware).
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { canTransition, rationaleRequired } from '@/lib/decision/states'
import { parseDecisionTransition } from '@/lib/scoring/schemas'
import type { DecisionState } from '@/types/decision'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const parsed = parseDecisionTransition(await req.json().catch(() => null))
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { trendId, toState, rationale, actor } = parsed.value

  const trendRows = (await sql().query(
    `SELECT decision_state, name FROM culture_trends WHERE id = $1`,
    [trendId],
  )) as Array<{ decision_state: DecisionState; name: string }>
  const trend = trendRows[0]
  if (!trend) {
    return NextResponse.json({ error: 'trend not found' }, { status: 404 })
  }

  const fromState = trend.decision_state
  if (fromState === toState) {
    return NextResponse.json({
      ok: true,
      trendId,
      fromState,
      toState,
      noop: true,
    })
  }

  if (!canTransition(fromState, toState)) {
    return NextResponse.json(
      {
        error: `Illegal transition ${fromState} → ${toState}`,
        allowedFrom: fromState,
      },
      { status: 422 },
    )
  }

  if (rationaleRequired(toState) && (!rationale || rationale.trim().length < 3)) {
    return NextResponse.json(
      {
        error: `Rationale required when transitioning to '${toState}' (min 3 chars).`,
      },
      { status: 422 },
    )
  }

  const resolvedActor =
    actor?.trim() ||
    req.headers.get('x-actor') ||
    req.headers.get('x-user-email') ||
    'system'

  await sql().query(
    `UPDATE culture_trends
        SET decision_state = $1,
            decision_updated_at = NOW(),
            updated_at = NOW()
      WHERE id = $2`,
    [toState, trendId],
  )
  await sql().query(
    `INSERT INTO culture_decision_history
       (trend_id, from_state, to_state, actor, rationale)
     VALUES ($1, $2, $3, $4, $5)`,
    [trendId, fromState, toState, resolvedActor, rationale ?? null],
  )

  return NextResponse.json({
    ok: true,
    trendId,
    trendName: trend.name,
    fromState,
    toState,
    actor: resolvedActor,
  })
}

export async function GET(req: NextRequest) {
  // Return the recent history for a trend
  const url = new URL(req.url)
  const trendId = url.searchParams.get('trendId')
  if (!trendId) {
    return NextResponse.json({ error: 'trendId required' }, { status: 400 })
  }
  const rows = (await sql().query(
    `SELECT id, from_state, to_state, actor, rationale, created_at::TEXT AS created_at
       FROM culture_decision_history
      WHERE trend_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [trendId],
  )) as Array<{
    id: number
    from_state: DecisionState | null
    to_state: DecisionState
    actor: string
    rationale: string | null
    created_at: string
  }>
  return NextResponse.json({ trendId, history: rows })
}
