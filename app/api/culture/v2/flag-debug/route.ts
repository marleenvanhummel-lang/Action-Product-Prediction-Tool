/**
 * GET /api/culture/v2/flag-debug
 * Quick diagnostic to verify Vercel env vars reach runtime.
 * Public read.
 */
import { NextResponse } from 'next/server'
import { flagSnapshot } from '@/lib/feature-flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    flags: flagSnapshot(),
    rawValues: {
      FLAG_VNEXT_SYSTEM_BANNERS: process.env.FLAG_VNEXT_SYSTEM_BANNERS,
      FLAG_VNEXT_CONFIDENCE: process.env.FLAG_VNEXT_CONFIDENCE,
      FLAG_VNEXT_MAGAZINE: process.env.FLAG_VNEXT_MAGAZINE,
      FLAG_VNEXT_TRUST_PANEL: process.env.FLAG_VNEXT_TRUST_PANEL,
      FLAG_VNEXT_DECISION_STATE: process.env.FLAG_VNEXT_DECISION_STATE,
    },
  })
}
