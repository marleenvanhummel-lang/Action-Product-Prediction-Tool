import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { FacebookPost } from '@/types/trends'

export async function GET() {
  const { data, error } = await supabase
    .from('FB data scraper')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const posts: FacebookPost[] = (data ?? []).map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    caption: row['Caption (text)'] ?? '',
    facebookUrl: row['Facebook URL'] ?? '',
    likes: Number(row.Likes) || 0,
    comments: Number(row.Comments) || 0,
    shares: Number(row.Shares) || 0,
    topComment: row['Top comments'] ?? null,
    groupName: row.Groepsnaam ?? '',
  }))

  return NextResponse.json(posts)
}
