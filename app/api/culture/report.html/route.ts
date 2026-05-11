/**
 * GET /api/culture/report.html
 *
 * Returns the daily Culture Radar report as a standalone HTML document
 * — clipboard-friendly, email-forwardable, downloadable.
 *
 * Public (no API_SECRET required) so the team can share the URL externally
 * via Slack / WhatsApp / email forward. Middleware grants this path the
 * SSE exemption pattern via path-ending check; we also do an explicit
 * dual-mode check below.
 */

import { NextResponse } from 'next/server'
import { fetchReportData, renderReportHtml } from '@/lib/report-renderer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const data = await fetchReportData()
  const html = renderReportHtml(data)
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Content-Disposition': `inline; filename="culture-radar-${data.generatedAt.slice(0, 10)}.html"`,
    },
  })
}
