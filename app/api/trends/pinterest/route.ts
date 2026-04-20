import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  // Simple API key check to prevent unauthorized writes
  const apiKey = req.headers.get('x-api-key')
  const expectedKey = process.env.PINTEREST_UPLOAD_KEY
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const trends = body.trends

    if (!Array.isArray(trends) || trends.length === 0) {
      return NextResponse.json({ error: 'No trends provided', inserted: 0 }, { status: 400 })
    }

    const week = body.week
    if (!week) {
      return NextResponse.json({ error: 'Missing week field', inserted: 0 }, { status: 400 })
    }

    const rows = trends.map((t: { keyword: string; category: string; growth_raw?: string; growth_pct?: number; region?: string }) => ({
      keyword: t.keyword,
      category: t.category,
      growth_raw: t.growth_raw ?? null,
      growth_pct: t.growth_pct ?? null,
      region: t.region ?? 'NL',
      week,
    }))

    const { data, error } = await supabaseAdmin
      .from('pinterest_trends')
      .upsert(rows, { onConflict: 'keyword,category,region,week' })
      .select()

    if (error) {
      console.error('[Pinterest Upload] Supabase error:', error.message)
      return NextResponse.json({ error: error.message, inserted: 0 }, { status: 500 })
    }

    return NextResponse.json({ inserted: data?.length ?? 0, week })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg, inserted: 0 }, { status: 500 })
  }
}

// GET: return latest Pinterest trends for display
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('pinterest_trends')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message, trends: [] }, { status: 500 })
  }

  return NextResponse.json({ trends: data ?? [], count: data?.length ?? 0 })
}
