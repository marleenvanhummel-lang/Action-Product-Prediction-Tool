/**
 * Daily Culture Radar report renderer.
 *
 * Generates a newsletter-style HTML report from the current state of the
 * culture_trends + culture_moments tables. Designed to feel like a daily
 * briefing email — clean typography, big sections, embedded thumbnails,
 * actionable content angles.
 *
 * Used by:
 *   - /culture-radar/report page (server-rendered, public, shareable)
 *   - /api/culture/report.html (raw HTML download for email forwarding)
 */

import { sql } from '@/lib/culture-db'
import { isoWeek } from '@/lib/culture-radar'
import type { ActionBrief, CultureTrend, CultureMoment } from '@/types/culture'

interface TrendForReport {
  id: string
  name: string
  description: string
  category: string
  popularity_score: number
  daily_rank: number | null
  weekly_rank: number | null
  hashtags: string[] | null
  example_urls: string[] | null
  thumbnail_url: string | null
  thumbnail_meta: { authorName?: string } | null
  brand_brief: ActionBrief | null
  source_names: string[] | null
  estimated_views: string | null
  country_relevance: string[] | null
  first_seen_at: string
  content_type: string | null
  mindmap: CultureTrend['mindmap']
}

interface MomentForReport {
  id: string
  name: string
  description: string
  category: string
  tier: string
  cultural_relevance: number
  country_dates: Array<{ country: string; date: string; localName?: string }>
  next_occurrence: string | null
  brand_brief: ActionBrief | null
  related_topics: CultureMoment['relatedTopics']
}

export interface ReportData {
  generatedAt: string
  week: string
  dailyTop10: TrendForReport[]
  weeklyTop20: TrendForReport[]
  inspiration: TrendForReport[]
  emerging: TrendForReport[]
  upcomingMoments: MomentForReport[]
}

export async function fetchReportData(): Promise<ReportData> {
  const week = isoWeek()

  const dailyTop10 = (await sql().query(
    `SELECT id, name, description, category, popularity_score, daily_rank,
            weekly_rank, hashtags, example_urls, thumbnail_url, thumbnail_meta,
            brand_brief, source_names, estimated_views, country_relevance,
            first_seen_at::TEXT AS first_seen_at, content_type, mindmap
       FROM culture_trends
      WHERE rank_week = $1 AND status = 'active' AND daily_rank IS NOT NULL
      ORDER BY daily_rank ASC LIMIT 10`,
    [week],
  )) as TrendForReport[]

  const weeklyTop20 = (await sql().query(
    `SELECT id, name, description, category, popularity_score, daily_rank,
            weekly_rank, hashtags, example_urls, thumbnail_url, thumbnail_meta,
            brand_brief, source_names, estimated_views, country_relevance,
            first_seen_at::TEXT AS first_seen_at, content_type, mindmap
       FROM culture_trends
      WHERE rank_week = $1 AND status = 'active' AND weekly_rank IS NOT NULL
        AND (daily_rank IS NULL OR daily_rank > 10)
      ORDER BY weekly_rank ASC LIMIT 20`,
    [week],
  )) as TrendForReport[]

  const inspiration = (await sql().query(
    `SELECT id, name, description, category, popularity_score, daily_rank,
            weekly_rank, hashtags, example_urls, thumbnail_url, thumbnail_meta,
            brand_brief, source_names, estimated_views, country_relevance,
            first_seen_at::TEXT AS first_seen_at, content_type, mindmap
       FROM culture_trends
      WHERE status = 'active'
        AND content_type IN ('format','meme','aesthetic','behavior')
        AND freshness_score >= 5
      ORDER BY first_seen_at DESC, popularity_score DESC
      LIMIT 8`,
  )) as TrendForReport[]

  const emerging = (await sql().query(
    `SELECT id, name, description, category, popularity_score, daily_rank,
            weekly_rank, hashtags, example_urls, thumbnail_url, thumbnail_meta,
            brand_brief, source_names, estimated_views, country_relevance,
            first_seen_at::TEXT AS first_seen_at, content_type, mindmap
       FROM culture_trends
      WHERE status = 'active' AND popularity_score < 7 AND freshness_score >= 7
      ORDER BY first_seen_at DESC LIMIT 6`,
  )) as TrendForReport[]

  const upcomingMoments = (await sql().query(
    `SELECT id, name, description, category, tier, cultural_relevance,
            country_dates, next_occurrence::TEXT AS next_occurrence,
            brand_brief, related_topics
       FROM culture_moments
      WHERE status <> 'archived'
        AND next_occurrence IS NOT NULL
        AND next_occurrence >= CURRENT_DATE
        AND next_occurrence <= CURRENT_DATE + INTERVAL '21 days'
      ORDER BY next_occurrence ASC, cultural_relevance DESC
      LIMIT 8`,
  )) as MomentForReport[]

  return {
    generatedAt: new Date().toISOString(),
    week,
    dailyTop10,
    weeklyTop20,
    inspiration,
    emerging,
    upcomingMoments,
  }
}

// ── HTML rendering ──────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🍴', beauty: '💄', fashion: '👗', home: '🏠', lifestyle: '✨',
  tech: '💻', meme: '😂', culture: '🎭', platform: '📱', sound: '🎵',
  sport: '⚽', festival: '🎪', religious: '🕊️', seasonal: '🌿',
  entertainment: '🎬', music: '🎤', celebrity: '⭐', product_launch: '📦',
  award_show: '🏆', political: '🏛️', pop_culture: '🌀', national: '🏳️',
  holiday: '🎉',
}

const CATEGORY_COLOR: Record<string, string> = {
  food: '#ea580c', beauty: '#db2777', fashion: '#9333ea', home: '#0891b2',
  lifestyle: '#ca8a04', tech: '#2563eb', meme: '#dc2626', culture: '#7c3aed',
  platform: '#16a34a', sound: '#0284c7',
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function renderTrendCard(t: TrendForReport, opts: { showRank?: boolean } = {}): string {
  const emoji = CATEGORY_EMOJI[t.category] ?? '🔥'
  const color = CATEGORY_COLOR[t.category] ?? '#6b7280'
  const brief = t.brand_brief
  const countries = (t.country_relevance ?? []).slice(0, 4).join(' ')
  const videoUrls = (t.example_urls ?? []).filter(
    (u) => u.includes('tiktok.com') || u.includes('instagram.com') || u.includes('youtube.com'),
  )
  const otherUrls = (t.example_urls ?? []).filter(
    (u) => !videoUrls.includes(u),
  )

  return `
<tr><td style="padding:0 0 24px 0;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-left:4px solid ${color};border-radius:6px;overflow:hidden;border:1px solid #e5e7eb;border-left-color:${color};">
    <tr>
      ${t.thumbnail_url
        ? `<td width="120" valign="top" style="padding:0;background:#000;">
            <img src="${escapeHtml(t.thumbnail_url)}" alt="" width="120" style="display:block;width:120px;height:auto;object-fit:cover;border:0;" />
          </td>`
        : `<td width="120" valign="middle" style="padding:24px 0;background:${color}15;text-align:center;font-size:48px;line-height:1;">${emoji}</td>`}
      <td valign="top" style="padding:16px 18px;">
        ${opts.showRank && t.daily_rank ? `<span style="display:inline-block;background:#E3000F;color:#fff;font-weight:700;font-size:12px;padding:2px 8px;border-radius:99px;margin-right:6px;">#${t.daily_rank}</span>` : ''}
        <span style="display:inline-block;background:${color}15;color:${color};font-size:10px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;padding:3px 8px;border-radius:4px;margin-right:6px;">${emoji} ${escapeHtml(t.category)}</span>
        ${countries ? `<span style="font-size:10px;color:#6b7280;">${escapeHtml(countries)}</span>` : ''}
        <h3 style="margin:6px 0 4px 0;font-family:Georgia,serif;font-size:18px;color:#111827;line-height:1.3;">${escapeHtml(t.name)}</h3>
        <p style="margin:6px 0 0 0;font-size:13px;color:#374151;line-height:1.5;">${escapeHtml(t.description.slice(0, 280))}${t.description.length > 280 ? '…' : ''}</p>
        ${t.hashtags && t.hashtags.length > 0 ? `<p style="margin:6px 0 0 0;font-size:11px;color:#6b7280;">${escapeHtml(t.hashtags.slice(0, 5).join(' '))}</p>` : ''}
        ${t.estimated_views ? `<p style="margin:4px 0 0 0;font-size:11px;color:#9ca3af;">📊 ${escapeHtml(t.estimated_views)}</p>` : ''}
        ${brief ? `
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;background:#fafafa;border-radius:4px;">
            <tr>
              <td style="padding:10px 12px;">
                <p style="margin:0 0 4px 0;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Voor Action</p>
                <p style="margin:0 0 8px 0;font-size:13px;color:#1f2937;line-height:1.5;">${escapeHtml(brief.actionRelevance)}</p>
                <p style="margin:0 0 4px 0;font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Content aanpak</p>
                <p style="margin:0 0 6px 0;font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(brief.contentAngle)}</p>
                ${brief.suggestedSound ? `<p style="margin:0;font-size:11px;color:#6b7280;">♪ <strong>${brief.soundRisk === 'safe' ? '✓' : brief.soundRisk === 'risky' ? '⚠' : '?'}</strong> ${escapeHtml(brief.suggestedSound)}</p>` : ''}
                ${brief.productCategories && brief.productCategories.length > 0 ? `
                <p style="margin:8px 0 0 0;font-size:11px;">
                  ${brief.productCategories.map((c) => `<span style="display:inline-block;background:#fef2f2;color:#E3000F;border:1px solid #fecaca;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:600;margin-right:4px;">${escapeHtml(c)}</span>`).join('')}
                </p>` : ''}
                <p style="margin:6px 0 0 0;font-size:10px;color:#9ca3af;">⏱️ urgency ${brief.urgency}/10 · ${escapeHtml(brief.lifecycleStage)}</p>
              </td>
            </tr>
          </table>
        ` : ''}
        ${videoUrls.length > 0 || otherUrls.length > 0 ? `
          <p style="margin:10px 0 0 0;font-size:11px;">
            ${videoUrls.slice(0, 3).map((u) => `<a href="${escapeHtml(u)}" style="display:inline-block;background:#000;color:#fff;padding:4px 10px;border-radius:4px;text-decoration:none;font-weight:600;margin-right:4px;margin-bottom:4px;">▶ ${u.includes('tiktok.com') ? 'TikTok' : u.includes('instagram.com') ? 'Reel' : 'YouTube'}</a>`).join('')}
            ${otherUrls.slice(0, 2).map((u) => `<a href="${escapeHtml(u)}" style="display:inline-block;background:#f3f4f6;color:#4a4f5c;padding:4px 10px;border-radius:4px;text-decoration:none;margin-right:4px;margin-bottom:4px;border:1px solid #e5e7eb;">📄 Article</a>`).join('')}
          </p>
        ` : ''}
        ${t.mindmap && (t.mindmap.origin?.length > 0 || t.mindmap.brandPlays?.length > 0) ? `
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:10px;border-top:1px dashed #e5e7eb;">
            <tr>
              <td style="padding:8px 0 0 0;">
                ${t.mindmap.origin && t.mindmap.origin.length > 0 ? `<p style="margin:0 0 4px 0;font-size:10px;color:#6b7280;"><strong style="color:#065f46;">🌱 Origin:</strong> ${escapeHtml(t.mindmap.origin[0].label)}${t.mindmap.origin[0].detail ? ' — ' + escapeHtml(t.mindmap.origin[0].detail.slice(0, 110)) : ''}</p>` : ''}
                ${t.mindmap.brandPlays && t.mindmap.brandPlays.length > 0 ? `<p style="margin:0;font-size:10px;color:#6b7280;"><strong style="color:#b91c1c;">💼 Brand plays:</strong> ${escapeHtml(t.mindmap.brandPlays[0].label)}${t.mindmap.brandPlays[0].detail ? ' — ' + escapeHtml(t.mindmap.brandPlays[0].detail.slice(0, 110)) : ''}</p>` : ''}
              </td>
            </tr>
          </table>
        ` : ''}
      </td>
    </tr>
  </table>
</td></tr>`
}

function renderMomentRow(m: MomentForReport): string {
  const date = m.next_occurrence ? new Date(m.next_occurrence) : null
  const daysUntil = date ? Math.ceil((date.getTime() - Date.now()) / 86_400_000) : 0
  const countries = (m.country_dates ?? []).map((c) => c.country).join(' ')
  const brief = m.brand_brief
  return `
<tr>
  <td width="60" valign="top" style="padding:10px 0;text-align:center;">
    <div style="background:#E3000F;color:#fff;border-radius:6px;padding:6px 4px;">
      <div style="font-size:18px;font-weight:700;line-height:1;">${date ? date.getDate() : '?'}</div>
      <div style="font-size:10px;text-transform:uppercase;margin-top:2px;">${date ? date.toLocaleDateString('en-GB', { month: 'short' }) : ''}</div>
      <div style="font-size:9px;margin-top:2px;opacity:0.85;">in ${daysUntil}d</div>
    </div>
  </td>
  <td valign="top" style="padding:10px 0 10px 12px;border-bottom:1px solid #f0f0f0;">
    <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${escapeHtml(m.name)}</p>
    <p style="margin:2px 0 0 0;font-size:11px;color:#6b7280;">${escapeHtml(m.category)} · ${escapeHtml(countries)}</p>
    <p style="margin:4px 0 0 0;font-size:12px;color:#374151;line-height:1.4;">${escapeHtml(m.description.slice(0, 180))}${m.description.length > 180 ? '…' : ''}</p>
    ${brief ? `<p style="margin:4px 0 0 0;font-size:11px;color:#4a4f5c;"><strong>Voor Action:</strong> ${escapeHtml(brief.contentAngle.slice(0, 200))}</p>` : ''}
  </td>
</tr>`
}

export function renderReportHtml(data: ReportData): string {
  const dateLabel = formatDate(data.generatedAt)
  const totalTrends = data.dailyTop10.length + data.weeklyTop20.length + data.inspiration.length + data.emerging.length

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Culture Radar Daily — ${dateLabel}</title>
<style>
  body { margin: 0; padding: 0; background: #f5f5f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1f2937; }
  a { color: inherit; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f5f0;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="720" style="max-width:720px;background:#ffffff;">
        <!-- Hero header -->
        <tr>
          <td style="padding:32px 40px 24px;background:linear-gradient(135deg,#E3000F 0%,#7c1010 100%);color:#ffffff;">
            <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;opacity:0.85;">CULTURE RADAR DAILY</p>
            <h1 style="margin:8px 0 4px 0;font-family:Georgia,serif;font-size:32px;line-height:1.1;font-weight:700;">${dateLabel}</h1>
            <p style="margin:0;font-size:13px;opacity:0.85;">${totalTrends} trends · ${data.upcomingMoments.length} upcoming moments · week ${data.week}</p>
          </td>
        </tr>

        <!-- TLDR -->
        <tr>
          <td style="padding:24px 40px 8px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;font-style:italic;">
              Goedemorgen team. Hieronder de top trends die NU spelen op TikTok, Reels en het bredere internet, plus de moments die we de komende weken kunnen oppakken. Klik op een trend om naar de video te gaan. Sounds met een ✓ zijn safe voor Action's business account.
            </p>
          </td>
        </tr>

        <!-- DAILY TOP 10 -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <p style="margin:0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#E3000F;font-weight:700;">SECTION 01</p>
            <h2 style="margin:4px 0 4px 0;font-family:Georgia,serif;font-size:24px;color:#111827;">🔥 Today's Top ${data.dailyTop10.length}</h2>
            <p style="margin:0 0 16px 0;font-size:12px;color:#6b7280;">The trends Action's team needs to know about right now.</p>
          </td>
        </tr>
        <tr><td style="padding:0 40px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${data.dailyTop10.map((t) => renderTrendCard(t, { showRank: true })).join('')}
          </table>
        </td></tr>

        ${data.inspiration.length > 0 ? `
        <!-- INSPIRATION -->
        <tr>
          <td style="padding:32px 40px 8px;border-top:8px solid #f5f5f0;">
            <p style="margin:0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#0891b2;font-weight:700;">SECTION 02</p>
            <h2 style="margin:4px 0 4px 0;font-family:Georgia,serif;font-size:24px;color:#111827;">💡 Inspiration formats</h2>
            <p style="margin:0 0 16px 0;font-size:12px;color:#6b7280;">Ways to MAKE content — editing tricks, visual signatures, format templates the team can copy.</p>
          </td>
        </tr>
        <tr><td style="padding:0 40px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${data.inspiration.map((t) => renderTrendCard(t)).join('')}
          </table>
        </td></tr>` : ''}

        ${data.emerging.length > 0 ? `
        <!-- EMERGING -->
        <tr>
          <td style="padding:32px 40px 8px;border-top:8px solid #f5f5f0;">
            <p style="margin:0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#7c3aed;font-weight:700;">SECTION 03</p>
            <h2 style="margin:4px 0 4px 0;font-family:Georgia,serif;font-size:24px;color:#111827;">✨ Emerging signals</h2>
            <p style="margin:0 0 16px 0;font-size:12px;color:#6b7280;">Small but rising — get in early.</p>
          </td>
        </tr>
        <tr><td style="padding:0 40px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${data.emerging.map((t) => renderTrendCard(t)).join('')}
          </table>
        </td></tr>` : ''}

        ${data.upcomingMoments.length > 0 ? `
        <!-- MOMENTS -->
        <tr>
          <td style="padding:32px 40px 8px;border-top:8px solid #f5f5f0;">
            <p style="margin:0;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#ea580c;font-weight:700;">SECTION 04</p>
            <h2 style="margin:4px 0 4px 0;font-family:Georgia,serif;font-size:24px;color:#111827;">📅 Komende moments (21 dagen)</h2>
            <p style="margin:0 0 16px 0;font-size:12px;color:#6b7280;">Plan campaigns around these.</p>
          </td>
        </tr>
        <tr><td style="padding:0 40px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${data.upcomingMoments.map(renderMomentRow).join('')}
          </table>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px;border-top:8px solid #f5f5f0;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:11px;color:#9ca3af;">Generated ${new Date(data.generatedAt).toLocaleString('nl-NL')}</p>
            <p style="margin:0;font-size:11px;">
              <a href="https://action-culture-radar.vercel.app/culture-radar" style="color:#E3000F;text-decoration:none;font-weight:600;">→ Open live dashboard</a>
              &nbsp;·&nbsp;
              <a href="https://action-culture-radar.vercel.app/moments-radar" style="color:#E3000F;text-decoration:none;font-weight:600;">→ Moments Radar</a>
            </p>
            <p style="margin:16px 0 0 0;font-size:10px;color:#d1d5db;">Culture Radar — daily briefing from your AI agency</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
