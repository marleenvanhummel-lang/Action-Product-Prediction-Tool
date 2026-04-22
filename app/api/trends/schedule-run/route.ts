import { NextResponse } from 'next/server'

export const maxDuration = 300

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

async function runDailyPrediction(): Promise<{ predictionsCount: number; painsGainsRefreshed: boolean }> {
  console.log('[ScheduleRun] Daily scheduled analysis triggered at', new Date().toISOString())
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const auth = `Bearer ${process.env.API_SECRET}`

  const predictRes = await fetch(`${baseUrl}/api/trends/predict?refresh=1`, {
    method: 'GET',
    headers: { 'Authorization': auth },
  })
  if (!predictRes.ok) throw new Error(`Predict endpoint returned ${predictRes.status}`)
  const predictResult = await predictRes.json()
  const predictionsCount = predictResult.predictions?.length || 0
  console.log('[ScheduleRun] Predictions done:', predictionsCount)

  let painsGainsRefreshed = false
  try {
    const pgRes = await fetch(`${baseUrl}/api/trends/pains-gains?refresh=1`, {
      method: 'GET',
      headers: { 'Authorization': auth },
    })
    painsGainsRefreshed = pgRes.ok
    if (!pgRes.ok) console.warn(`[ScheduleRun] Pains/gains returned ${pgRes.status}`)
    else console.log('[ScheduleRun] Pains/gains refreshed')
  } catch (err) {
    console.warn('[ScheduleRun] Pains/gains refresh failed (non-fatal):', err instanceof Error ? err.message : String(err))
  }

  return { predictionsCount, painsGainsRefreshed }
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
