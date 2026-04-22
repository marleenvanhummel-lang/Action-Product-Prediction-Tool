import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import FirecrawlApp from '@mendable/firecrawl-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Import types and helper functions from the main predict endpoint
// We'll duplicate what we need since the main endpoint doesn't export these helpers
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY ?? '' })

// Authorization check: accepts either API_SECRET (manual) or CRON_SECRET (Vercel Cron)
async function authorize(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('authorization')
  const apiSecret = process.env.API_SECRET
  const cronSecret = process.env.CRON_SECRET

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('[ScheduleRun] Missing or invalid authorization header')
    return false
  }

  const token = authHeader.substring(7)
  if (apiSecret && token === apiSecret) return true
  if (cronSecret && token === cronSecret) return true
  return false
}

async function runDailyPrediction(): Promise<{ predictionsCount: number }> {
  console.log('[ScheduleRun] Daily scheduled analysis triggered at', new Date().toISOString())
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const predictUrl = `${baseUrl}/api/trends/predict?refresh=1`

  const response = await fetch(predictUrl, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${process.env.API_SECRET}` },
  })
  if (!response.ok) throw new Error(`Predict endpoint returned ${response.status}`)
  const result = await response.json()
  console.log('[ScheduleRun] Analysis complete:', result.predictions?.length, 'predictions cached')
  return { predictionsCount: result.predictions?.length || 0 }
}

/**
 * Scheduled trend analysis endpoint
 * 
 * Called daily at 08:30 UTC by GitHub Actions
 * Bypasses cache and forces a fresh analysis
 * 
 * Authorization: Bearer {API_SECRET}
 * 
 * Usage:
 * curl -X POST http://localhost:3001/api/trends/schedule-run \
 *   -H "Authorization: Bearer $API_SECRET"
 */
export async function POST(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { predictionsCount } = await runDailyPrediction()
    return NextResponse.json({
      success: true,
      message: 'Daily analysis completed',
      timestamp: new Date().toISOString(),
      predictionsCount,
    })
  } catch (error) {
    console.error('[ScheduleRun] Failed:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint — triggered by Vercel Cron daily (per vercel.json)
 * Authorizes via CRON_SECRET (Vercel auto-includes it) or API_SECRET.
 */
export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { predictionsCount } = await runDailyPrediction()
    return NextResponse.json({
      success: true,
      message: 'Daily analysis completed',
      timestamp: new Date().toISOString(),
      predictionsCount,
    })
  } catch (error) {
    console.error('[ScheduleRun GET] Failed:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
