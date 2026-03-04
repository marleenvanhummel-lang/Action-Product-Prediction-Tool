import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { TikTokPost } from '@/types/trends'

export async function GET() {
  const { data, error } = await supabase
    .from('Tiktok Data Action')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const posts: TikTokPost[] = (data ?? []).map((row) => ({
    id: String(row.id),
    createdAt: row.created_at,
    caption: row.Caption ?? '',
    videoUrl: row['Video URL'] ?? '',
    views: Number(row.Views) || 0,
    likes: Number(row.Likes) || 0,
    shares: Number(row.Shares) || 0,
    comments: Number(row.Comments) || 0,
    searchTerm: row.Zoekterm ?? '',
    tags: row.Tags ?? null,
    isAd: row['Is ad?'] === true || row['Is ad?'] === 'true' || row['Is ad?'] === 1,
  }))

  return NextResponse.json(posts)
}
