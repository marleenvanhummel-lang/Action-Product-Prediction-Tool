import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  // Simple API key check
  const apiKey = req.headers.get('x-api-key')
  const expectedKey = process.env.API_SECRET
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { data } = body

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: 'No data provided', inserted: 0 }, { status: 400 })
    }

    // Transform data to match redditdata table structure
    const rows = data.map((item: any) => ({
      "Post ID": item["Post ID"],
      "Post Title": item["Post Title"],
      "Post Text": item["Post Text"],
      "Post Date": item["Post Date"],
      "Upvotes": item["Upvotes"],
      "Downvotes": item["Downvotes"],
      "Comments Count": item["Comments Count"],
      "Post URL": item["Post URL"],
      "Subreddit": item["Subreddit"],
      "Author": item["Author"],
      "Author Karma": item["Author Karma"],
      "Media Type": item["Media Type"],
      "Media URL": item["Media URL"],
      "Hashtags": item["Hashtags"],
      "Mentions": item["Mentions"],
      created_at: item.created_at || new Date().toISOString()
    }))

    const { data: inserted, error } = await supabaseAdmin
      .from('redditdata')
      .insert(rows)
      .select()

    if (error) {
      console.error('[Reddit Upload] Supabase error:', error.message)
      return NextResponse.json({ error: error.message, inserted: 0 }, { status: 500 })
    }

    return NextResponse.json({ inserted: inserted?.length ?? 0 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg, inserted: 0 }, { status: 500 })
  }
}