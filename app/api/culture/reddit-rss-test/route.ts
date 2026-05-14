/**
 * GET /api/culture/reddit-rss-test
 * One-off diagnostic: can Vercel fetch Reddit RSS?
 * Reddit blocks cloud IPs on .json — checking if .rss is also blocked.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = 'https://www.reddit.com/r/cottagecore/top.rss?t=week'
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'CultureRadarBot/1.0 (+https://action-culture-radar.vercel.app)',
        Accept: 'application/atom+xml, application/rss+xml, application/xml',
      },
    })
    clearTimeout(tid)
    const text = await res.text()
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      bytes: text.length,
      preview: text.slice(0, 600),
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
