import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { TrendPost } from '@/types/trends'

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/submitted by.*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  let query = supabase
    .from('redditdata')
    .select('*')
    .order('created_at', { ascending: false })

  if (category && category !== 'all') {
    query = query.eq('Categorieën', category)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const posts: TrendPost[] = (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    title: row.Titel,
    description: stripHtml(row.Beschrijving),
    url: row.URL,
    category: row.Categorieën,
  }))

  return NextResponse.json(posts)
}
