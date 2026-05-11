/**
 * GET /api/moments/list
 *
 * Query params (all optional):
 *   country         — NL | FR | DE | BE | ES | IT | PL | CZ | SK | HU | AT | CH | RO | PT
 *   category        — holiday | sport | festival | ... (see MomentCategory)
 *   tier            — 'standard' | 'cultural'
 *   horizonDays     — only return moments within N days (default 90)
 *   includeArchived — '1' to include past one-time moments
 *   limit           — max 500 (default 200)
 */

import { NextRequest, NextResponse } from 'next/server'
import { listMoments, rowToMoment } from '@/lib/moments-db'
import type { ActionCountry, MomentCategory, MomentTier } from '@/types/culture'

const VALID_COUNTRIES: ActionCountry[] = [
  'NL', 'FR', 'DE', 'BE', 'ES', 'IT', 'PL', 'CZ', 'SK', 'HU', 'AT', 'CH', 'RO', 'PT',
]
const VALID_CATEGORIES: MomentCategory[] = [
  'holiday', 'national', 'sport', 'festival', 'religious', 'seasonal',
  'entertainment', 'music', 'celebrity', 'product_launch', 'award_show',
  'political', 'pop_culture',
]
const VALID_TIERS: MomentTier[] = ['standard', 'cultural']

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams

  const country = params.get('country')?.toUpperCase()
  const category = params.get('category')?.toLowerCase()
  const tier = params.get('tier')?.toLowerCase()
  const horizonDaysRaw = params.get('horizonDays')
  const includeArchived = params.get('includeArchived') === '1'
  const limit = Number(params.get('limit') ?? 200)

  const rows = await listMoments({
    country: country && VALID_COUNTRIES.includes(country as ActionCountry)
      ? (country as ActionCountry)
      : null,
    category: category && VALID_CATEGORIES.includes(category as MomentCategory)
      ? (category as MomentCategory)
      : null,
    tier: tier && VALID_TIERS.includes(tier as MomentTier)
      ? (tier as MomentTier)
      : null,
    horizonDays: horizonDaysRaw ? Number(horizonDaysRaw) : 90,
    includeArchived,
    limit,
  })

  return NextResponse.json({
    count: rows.length,
    moments: rows.map(rowToMoment),
  })
}
