/**
 * POST /api/moments/submit
 *
 * Manually add a cultural moment to the Moments Radar.
 *
 * Body (JSON):
 *   name              string   required
 *   description       string   required
 *   tier              'standard' | 'cultural'   required
 *   category          MomentCategory             required
 *   scope             'global' | 'country-specific'  default 'country-specific'
 *   culturalRelevance number 0-10                default 5
 *   countryDates      Array<{ country, date, localName? }>  required
 *   recurring         'yearly' | 'yearly-variable' | 'one-time'
 *   typicalDurationDays number                     default 1
 *   hashtags          string[]
 *   url               string                       optional reference URL
 *
 * Returns: { ok, id, slug, nextOccurrence }
 *
 * Generates the Action brief asynchronously after insert (same pattern as
 * /api/culture/submit). The dashboard picks it up on next load.
 */

import { NextRequest, NextResponse } from 'next/server'
import { upsertMoment, saveMomentBrief } from '@/lib/moments-db'
import { sql, getTrendingSounds } from '@/lib/culture-db'
import { generateActionBrief } from '@/lib/culture-action-brief'
import { slugify, isoWeek } from '@/lib/culture-radar'
import type { ActionCountry, CountryDate, MomentCategory, MomentTier } from '@/types/culture'

const VALID_COUNTRIES: ActionCountry[] = [
  'NL', 'FR', 'DE', 'BE', 'ES', 'IT', 'PL', 'CZ', 'SK', 'HU', 'AT', 'CH', 'RO', 'PT',
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name?.trim() || !body.description?.trim() || !body.category || !body.tier) {
      return NextResponse.json(
        { error: 'name, description, category, and tier are required' },
        { status: 400 },
      )
    }

    const countryDatesRaw: unknown[] = Array.isArray(body.countryDates) ? body.countryDates : []
    const countryDates: CountryDate[] = countryDatesRaw
      .filter((cd): cd is { country: string; date: string; localName?: string } =>
        cd != null &&
        typeof cd === 'object' &&
        typeof (cd as { country?: unknown }).country === 'string' &&
        typeof (cd as { date?: unknown }).date === 'string',
      )
      .filter((cd) => VALID_COUNTRIES.includes(cd.country.toUpperCase() as ActionCountry))
      .map((cd) => ({
        country: cd.country.toUpperCase() as ActionCountry,
        date: cd.date,
        localName: cd.localName,
      }))

    const scope: 'global' | 'country-specific' = body.scope === 'global'
      ? 'global'
      : 'country-specific'

    if (scope === 'country-specific' && countryDates.length === 0) {
      return NextResponse.json(
        { error: 'country-specific moments need at least one country_dates entry' },
        { status: 400 },
      )
    }

    const slug = slugify(body.name.trim())
    if (!slug) return NextResponse.json({ error: 'invalid name' }, { status: 400 })

    const id = await upsertMoment({
      name: body.name.trim(),
      slug,
      description: body.description.trim(),
      tier: body.tier as MomentTier,
      culturalRelevance: Math.min(10, Math.max(0, Number(body.culturalRelevance) || 5)),
      category: body.category as MomentCategory,
      scope,
      countryDates,
      nextOccurrence: countryDates[0]?.date ?? null,
      recurring: body.recurring ?? null,
      typicalDurationDays: Number(body.typicalDurationDays) || 1,
      hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
      exampleUrls: body.url ? [body.url] : [],
      sourceNames: ['manual'],
      reasoning: body.url ? `Manually submitted. Reference: ${body.url}` : 'Manually submitted.',
    })

    // ── Async: generate Action brief ────────────────────────────────────
    ;(async () => {
      try {
        const trendingSounds = await getTrendingSounds(isoWeek(new Date()), 12)
        const countriesNote =
          scope === 'global'
            ? 'Global moment — applies to all Action countries.'
            : `Active in: ${countryDates.map((c) => `${c.country} (${c.date})`).join(', ')}`
        const brief = await generateActionBrief({
          name: body.name.trim(),
          description: body.description.trim() + '\n\n' + countriesNote,
          category: body.category,
          brandExample: null,
          url: body.url ?? null,
          trendingSounds,
        })
        if (brief) await saveMomentBrief(id, brief)
      } catch (err) {
        console.error('[moments/submit] brief generation failed:', err)
      }
    })()

    return NextResponse.json({
      ok: true,
      id,
      slug,
      nextOccurrence: countryDates[0]?.date ?? null,
    })
  } catch (err) {
    console.error('[moments/submit]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// silence linter: sql imported for transitive use
void sql
