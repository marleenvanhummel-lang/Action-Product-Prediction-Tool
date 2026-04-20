import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  // Simple API key check
  const apiKey = req.headers.get('x-api-key')
  const expectedKey = process.env.API_SECRET  // Using same key as other endpoints
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { data } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No data provided', inserted: 0 }, { status: 400 })
    }

    // Transform data to match Tiktok Data Action table structure
    const rows = data.map((item: any) => ({
      Caption: item.Caption,
      "Video URL": item["Video URL"],
      Views: item.Views,
      Likes: item.Likes,
      Shares: item.Shares,
      Comments: item.Comments,
      Zoekterm: item.Zoekterm,
      Tags: item.Tags,
      "Is ad?": item["Is ad?"],
      created_at: item.created_at || new Date().toISOString()
    }))

    const { data: inserted, error } = await supabaseAdmin
      .from('Tiktok Data Action')
      .insert(rows)
      .select()

    if (error) {
      console.error('[TikTok Upload] Supabase error:', error.message)
      return NextResponse.json({ error: error.message, inserted: 0 }, { status: 500 })
    }

    return NextResponse.json({ inserted: inserted?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg, inserted: 0 }, { status: 500 })
  }
}