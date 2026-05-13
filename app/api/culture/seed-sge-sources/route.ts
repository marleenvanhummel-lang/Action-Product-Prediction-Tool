/**
 * POST /api/culture/seed-sge-sources
 *
 * Adds Social Growth Engineers (https://www.socialgrowthengineers.com)
 * to the source rotation. SGE builds viral consumer apps and publishes
 * case studies about how creators / apps / campaigns go viral — exactly
 * the kind of intelligence Action's team needs.
 *
 * Idempotent — uses url UNIQUE constraint. Re-running this endpoint
 * just re-activates the sources if they were disabled.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

interface NewSource {
  name: string
  url: string
  category: string
  sourceType: string
  reliability: number
  detectionLagDays: number
  notes?: string
}

const SOURCES: NewSource[] = [
  {
    name: 'Social Growth Engineers · Case Studies',
    url: 'https://www.socialgrowthengineers.com/case-studies',
    category: 'platform',
    sourceType: 'blog',
    reliability: 7,
    detectionLagDays: 7,
    notes: 'Breakdowns of how viral consumer apps and campaigns blew up. Great for format intelligence + creator strategy patterns.',
  },
  {
    name: 'Social Growth Engineers · Apps Portfolio',
    url: 'https://www.socialgrowthengineers.com/apps',
    category: 'tech',
    sourceType: 'blog',
    reliability: 7,
    detectionLagDays: 7,
    notes: 'Portfolio of viral consumer apps SGE has built (Tea, Brainly, Coconote, Tik Wrapped). Surfaces app-driven viral moments + UGC formats.',
  },
  {
    name: 'Social Growth Engineers · Home',
    url: 'https://www.socialgrowthengineers.com',
    category: 'platform',
    sourceType: 'blog',
    reliability: 6,
    detectionLagDays: 5,
    notes: 'Homepage — featured campaigns, latest case studies, recent virality breakdowns.',
  },
]

export async function POST(_req: NextRequest) {
  const results: Array<{ url: string; inserted: boolean }> = []

  for (const s of SOURCES) {
    const rows = await sql().query(
      `INSERT INTO culture_sources
          (name, url, category, source_type, reliability, detection_lag_days, active, notes)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (url) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         source_type = EXCLUDED.source_type,
         reliability = EXCLUDED.reliability,
         detection_lag_days = EXCLUDED.detection_lag_days,
         notes = EXCLUDED.notes,
         active = true
       RETURNING (xmax = 0) AS inserted`,
      [s.name, s.url, s.category, s.sourceType, s.reliability, s.detectionLagDays, s.notes ?? null],
    ) as Array<{ inserted: boolean }>

    results.push({ url: s.url, inserted: rows[0]?.inserted ?? false })
  }

  const newCount = results.filter((r) => r.inserted).length

  return NextResponse.json({
    ok: true,
    sources: results,
    summary: `${newCount} new, ${SOURCES.length - newCount} re-activated`,
    message: 'Social Growth Engineers sources added. Next daily cron will scrape them.',
  })
}
