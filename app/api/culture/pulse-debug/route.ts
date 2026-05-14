/**
 * GET /api/culture/pulse-debug
 * Diagnostic: what /discover scrape results do we have?
 */
import { NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'

export async function GET() {
  const rows = await sql().query(
    `SELECT source_name, url, status, length(text_snippet) AS snippet_len,
            scraped_at::TEXT AS scraped_at, processed_at::TEXT AS processed_at,
            substring(text_snippet from 1 for 400) AS preview
       FROM culture_scrape_results
      WHERE url ILIKE '%discover%'
      ORDER BY scraped_at DESC
      LIMIT 30`,
  )
  return NextResponse.json({ count: (rows as unknown[]).length, rows })
}
