/**
 * POST /api/culture/verify-urls
 *
 * Loops over active trends in the current week, verifies each TikTok /
 * Instagram / YouTube URL in `example_urls`, and drops the ones that don't
 * resolve (Perplexity hallucinations).
 *
 * Blog/news URLs are left alone — they don't have the hallucination problem.
 *
 * Body:
 *   {
 *     "limit": 100,      // max trends to verify (default 50)
 *     "force": false     // re-verify even URLs we already checked
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/culture-db'
import { isVideoPlatformUrl, verifyVideoUrls } from '@/lib/url-verification'

export const maxDuration = 300

interface TrendRow {
  id: string
  name: string
  example_urls: string[] | null
}

export async function POST(req: NextRequest) {
  const started = Date.now()
  let body: { limit?: number; force?: boolean } = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    /* empty body ok */
  }

  const limit = Math.min(200, Math.max(1, body.limit ?? 50))

  const rows = (await sql().query(
    `SELECT id, name, example_urls
       FROM culture_trends
      WHERE status = 'active'
        AND example_urls IS NOT NULL
        AND cardinality(example_urls) > 0
      ORDER BY first_seen_at DESC
      LIMIT $1`,
    [limit],
  )) as TrendRow[]

  let scanned = 0
  let dropped = 0
  let kept = 0
  const droppedExamples: Array<{ trend: string; url: string; reason?: string }> = []

  for (const row of rows) {
    const urls = row.example_urls ?? []
    const toVerify = urls.filter(isVideoPlatformUrl)
    const passThrough = urls.filter((u) => !isVideoPlatformUrl(u))

    if (toVerify.length === 0) continue
    scanned += toVerify.length

    const results = await verifyVideoUrls(toVerify, { concurrency: 3 })
    const validVideo = results.filter((r) => r.ok).map((r) => r.url)
    dropped += results.filter((r) => !r.ok).length
    kept += validVideo.length

    for (const r of results) {
      if (!r.ok) droppedExamples.push({ trend: row.name, url: r.url, reason: r.reason })
    }

    const newUrls = [...validVideo, ...passThrough]
    if (newUrls.length !== urls.length) {
      await sql().query(
        `UPDATE culture_trends SET example_urls = $1, updated_at = NOW() WHERE id = $2`,
        [newUrls, row.id],
      )
    }
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    processedTrends: rows.length,
    scannedUrls: scanned,
    videoUrlsKept: kept,
    videoUrlsDropped: dropped,
    droppedExamples: droppedExamples.slice(0, 40),
  })
}
