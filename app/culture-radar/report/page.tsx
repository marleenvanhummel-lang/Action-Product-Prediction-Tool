/**
 * Daily Culture Radar Report — server-rendered, shareable, no auth.
 *
 * Visit /culture-radar/report → latest briefing. Share the URL with
 * anyone, no login needed. Refreshes its data on every visit.
 */

import { fetchReportData, renderReportHtml } from '@/lib/report-renderer'
import ReportToolbar from './toolbar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CultureRadarReportPage() {
  const data = await fetchReportData()
  const html = renderReportHtml(data)

  return (
    <div style={{ background: '#f5f5f0', minHeight: '100vh' }}>
      <ReportToolbar generatedAt={data.generatedAt} />
      <div dangerouslySetInnerHTML={{ __html: extractBody(html) }} />
    </div>
  )
}

function extractBody(fullHtml: string): string {
  const m = fullHtml.match(/<body[^>]*>([\s\S]+)<\/body>/i)
  return m ? m[1] : fullHtml
}
