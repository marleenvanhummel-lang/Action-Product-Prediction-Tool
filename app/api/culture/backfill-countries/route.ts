/**
 * POST /api/culture/backfill-countries
 *
 * Loops over all active trends in the current week and tags each with the
 * Action countries where it's specifically relevant. Empty tag = global.
 *
 * Uses the keyword-based detector in lib/culture-country.ts — pure
 * function, no AI calls, fast (~milliseconds per trend).
 *
 * Body (optional):
 *   { "force": false }   re-tag even trends that already have a tag
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { detectTrendCountries } from '@/lib/culture-country'

export const maxDuration = 60

interface TrendRow {
  id: string
  name: string
  description: string
  hashtags: string[] | null
  source_names: string[] | null
  reasoning: string | null
  country_relevance: string[] | null
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { force?: boolean } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    /* allow empty */
  }

  const filter = body.force
    ? ''
    : 'AND (country_relevance IS NULL OR cardinality(country_relevance) = 0)'

  const rows = (await sql().query(
    `SELECT id, name, description, hashtags, source_names, reasoning, country_relevance
       FROM culture_trends
      WHERE status = 'active' ${filter}`,
  )) as TrendRow[]

  let tagged = 0
  let globalOnly = 0

  for (const r of rows) {
    const countries = detectTrendCountries({
      name: r.name,
      description: r.description,
      hashtags: r.hashtags ?? [],
      sourceNames: r.source_names ?? [],
      reasoning: r.reasoning ?? '',
    })
    await sql().query(
      `UPDATE culture_trends SET country_relevance = $1 WHERE id = $2`,
      [countries, r.id],
    )
    if (countries.length > 0) tagged++
    else globalOnly++
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processed: rows.length,
    countryTagged: tagged,
    globalOnly,
  })
}
