/**
 * GET  /api/culture/v2/confidence?id=<trendId>
 * POST /api/culture/v2/confidence/batch
 *
 * Returns a confidence score + breakdown for a single trend, or
 * recomputes confidence for a batch of trends.
 *
 * Read endpoint is public (matches the rest of /api/culture/* GET).
 * Batch recompute is auth-protected.
 *
 * The score is persisted into culture_trends.confidence_score and
 * .confidence_breakdown JSONB so list queries can sort + filter on it
 * without re-running the formula.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { computeConfidence } from '@/lib/scoring/confidence'
import type { ConfidenceInputs } from '@/lib/scoring/confidence'

export const dynamic = 'force-dynamic'

interface TrendRow {
  id: string
  source_ids: number[] | null
  country_relevance: string[] | null
  article_date_verdict: 'fresh' | 'inconclusive' | 'stale' | null
  manual_validation_status: 'pending' | 'approved' | 'rejected' | null
  verify_verdict_e: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
  verify_verdict_b: 'real' | 'generic' | 'fabricated' | 'uncertain' | null
}

interface SourceRow {
  id: number
  source_type: string
  reliability: number
}

async function loadInputsForTrend(trendId: string): Promise<ConfidenceInputs | null> {
  const rows = (await sql().query(
    `SELECT id, source_ids, country_relevance, article_date_verdict,
            manual_validation_status, verify_verdict_e, verify_verdict_b
       FROM culture_trends
      WHERE id = $1`,
    [trendId],
  )) as TrendRow[]
  const t = rows[0]
  if (!t) return null

  const sourceIds = (t.source_ids ?? []).filter((n) => Number.isInteger(n))
  const sources = sourceIds.length
    ? ((await sql().query(
        `SELECT id, source_type, reliability FROM culture_sources WHERE id = ANY($1)`,
        [sourceIds],
      )) as SourceRow[])
    : []

  return {
    sources: sources.map((s) => ({
      category: s.source_type,
      reliability: s.reliability,
    })),
    countryRelevance: t.country_relevance ?? [],
    articleDateVerdict: t.article_date_verdict,
    manualValidationStatus: t.manual_validation_status,
    verifierA: t.verify_verdict_e,
    verifierB: t.verify_verdict_b,
  }
}

async function persistConfidence(
  trendId: string,
  total: number,
  breakdown: unknown,
): Promise<void> {
  await sql().query(
    `UPDATE culture_trends
        SET confidence_score = $1,
            confidence_breakdown = $2::jsonb,
            confidence_computed_at = NOW()
      WHERE id = $3`,
    [total, JSON.stringify(breakdown), trendId],
  )
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const trendId = url.searchParams.get('id')
  if (!trendId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const inputs = await loadInputsForTrend(trendId)
  if (!inputs) {
    return NextResponse.json({ error: 'trend not found' }, { status: 404 })
  }

  const score = computeConfidence(inputs)
  await persistConfidence(trendId, score.total, score.breakdown)

  return NextResponse.json({
    trendId,
    confidence: score,
    inputs: {
      sourceCount: inputs.sources.length,
      distinctSourceCategories: new Set(inputs.sources.map((s) => s.category)).size,
      meanReliability:
        inputs.sources.length > 0
          ? inputs.sources.reduce((acc, s) => acc + s.reliability, 0) /
            inputs.sources.length
          : 0,
      countryRelevance: inputs.countryRelevance,
      articleDateVerdict: inputs.articleDateVerdict,
      manualValidationStatus: inputs.manualValidationStatus,
      verifierAgreement:
        inputs.verifierA === 'real' && inputs.verifierB === 'real'
          ? 'both'
          : inputs.verifierA === 'real' || inputs.verifierB === 'real'
            ? 'one'
            : 'none',
    },
  })
}

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { limit?: number }
  const limit = Math.min(500, Math.max(1, body.limit ?? 200))

  const targets = (await sql().query(
    `SELECT id FROM culture_trends
      WHERE status = 'active'
        AND (confidence_computed_at IS NULL OR confidence_computed_at < updated_at)
      ORDER BY updated_at DESC
      LIMIT $1`,
    [limit],
  )) as Array<{ id: string }>

  let processed = 0
  let errors = 0
  for (const { id } of targets) {
    try {
      const inputs = await loadInputsForTrend(id)
      if (!inputs) continue
      const score = computeConfidence(inputs)
      await persistConfidence(id, score.total, score.breakdown)
      processed++
    } catch (err) {
      errors++
      console.error(`[v2/confidence] failed for ${id}:`, err)
    }
  }

  return NextResponse.json({ ok: true, processed, errors, requested: targets.length })
}
