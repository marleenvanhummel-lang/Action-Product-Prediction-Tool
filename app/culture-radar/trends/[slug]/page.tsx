'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { use } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { CultureTrend } from '@/types/culture'

interface Snapshot {
  snapshot_date: string
  popularity_score: number
  freshness_score: number
  validation_score: number
  growth_score: number | null
  daily_rank: number | null
  weekly_rank: number | null
}

interface Lifecycle {
  stage: 'emerging' | 'climbing' | 'peak' | 'declining' | 'dormant'
  daysObserved: number
  peakPopularity: number
  currentPopularity: number
  daysSincePeak: number | null
  trendDirection: 'up' | 'flat' | 'down'
  confidence: 'high' | 'medium' | 'low'
}

interface SimilarTrend {
  id: string
  slug: string
  name: string
  description: string
  similarity: number
  category: string
  subculture: string | null
  vibe: string | null
}

interface TrendDetailResponse {
  ok: boolean
  trend: CultureTrend
  snapshots: Snapshot[]
  similar: SimilarTrend[]
  lifecycle: Lifecycle | null
  lifecycleStage: string | null
  verifyVerdict: string | null
}

interface CreatorMatch {
  handle: string
  platform: string
  profileUrl: string | null
  name: string | null
  niche: string | null
  whyRelevant: string | null
  followerCount: number | null
  countries: string[]
  fitScore: number
  matchReasons: string[]
  exampleVideoUrls: string[]
}

export default function TrendDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [data, setData] = useState<TrendDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creators, setCreators] = useState<CreatorMatch[]>([])

  useEffect(() => {
    apiFetch(`/api/culture/trend/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: TrendDetailResponse) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))

    apiFetch(`/api/culture/trend/${encodeURIComponent(slug)}/creators`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setCreators(d?.creators ?? []))
      .catch(() => { /* best-effort */ })
  }, [slug])

  if (error) return <ErrorState slug={slug} message={error} />
  if (!data) return <LoadingState />
  return <Detail data={data} creators={creators} />
}

function LoadingState() {
  return (
    <div className="jai-app" style={{ minHeight: '100vh', padding: 40 }}>
      <p className="jai-mono-label" style={{ color: '#FF1300' }}>Loading…</p>
    </div>
  )
}

function ErrorState({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="jai-app" style={{ minHeight: '100vh', padding: 40 }}>
      <p className="jai-mono-label" style={{ color: '#FF1300' }}>Error</p>
      <h1 style={{ fontFamily: 'var(--font-jai-display)', fontSize: 36, textTransform: 'uppercase' }}>
        {slug} — {message}
      </h1>
      <p><Link href="/culture-radar" style={{ color: '#FF1300' }}>← back to dashboard</Link></p>
    </div>
  )
}

function Detail({ data, creators }: { data: TrendDetailResponse; creators: CreatorMatch[] }) {
  const { trend, snapshots, similar, lifecycle, verifyVerdict } = data
  const brief = trend.brandBrief
  const mindmap = trend.mindmap

  return (
    <div className="jai-app" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#000', color: '#FFFDF3', padding: '32px 40px 24px' }}>
        <p style={{ margin: 0 }}>
          <Link href="/culture-radar" style={{ color: '#FF1300', textDecoration: 'none', fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.15em' }}>
            ← CULTURE RADAR
          </Link>
        </p>
        <h1 style={{ margin: '12px 0 0', fontFamily: 'var(--font-jai-display)', fontSize: 48, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: '-0.025em' }}>
          {trend.name}<span style={{ color: '#FF1300' }}>.</span>
        </h1>
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill>{trend.category}</Pill>
          {trend.subculture && <Pill>◇ {trend.subculture}</Pill>}
          {trend.vibe && <Pill>{trend.vibe}</Pill>}
          {lifecycle && <Pill highlight>{lifecycle.stage} {lifecycle.trendDirection === 'up' ? '↑' : lifecycle.trendDirection === 'down' ? '↓' : '→'}</Pill>}
          {trend.growthScore != null && <Pill>↗ {Number(trend.growthScore).toFixed(1)}/10</Pill>}
          {verifyVerdict && <Pill subtle>verify: {verifyVerdict}</Pill>}
          {trend.countryRelevance.slice(0, 6).map((c) => <Pill key={c} subtle>{c}</Pill>)}
        </div>
      </div>
      <div style={{ height: 6, background: '#FF1300' }} />

      <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
        {/* The signal */}
        <Section title="The signal">
          <p className="jai-serif" style={{ fontSize: 19, lineHeight: 1.45, color: '#1a1a1a', margin: 0 }}>
            {trend.description}
          </p>
          {trend.hashtags.length > 0 && (
            <p style={{ marginTop: 12, fontSize: 12, color: '#6b6b6b' }}>{trend.hashtags.join(' ')}</p>
          )}
          <p style={{ marginTop: 16, fontSize: 11, color: '#9ca3af' }}>
            popularity {trend.popularityScore}/10 · freshness {trend.freshnessScore}/10 · validation {trend.validationScore}×
            {trend.estimatedViews ? ` · ${trend.estimatedViews}` : ''}
          </p>
        </Section>

        {/* For Action */}
        {brief && (
          <Section title="For Action" dark>
            <p className="jai-mono-label" style={{ color: '#FF1300', margin: 0 }}>Why now</p>
            <p style={{ margin: '6px 0 14px', fontSize: 16, lineHeight: 1.45 }}>{brief.actionRelevance}</p>

            <p className="jai-mono-label" style={{ color: '#FFFDF3', margin: 0 }}>Content angle</p>
            <p style={{ margin: '6px 0 14px', fontSize: 14, lineHeight: 1.45, opacity: 0.92 }}>{brief.contentAngle}</p>

            {brief.suggestedSound && (
              <div style={{ padding: 10, background: '#FF1300', marginBottom: 8 }}>
                <p style={{ margin: 0, fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.15em' }}>
                  ♪ {brief.soundRisk === 'safe' ? '✓ SAFE' : brief.soundRisk === 'risky' ? '⚠ RISKY' : '? CHECK'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>{brief.suggestedSound}</p>
              </div>
            )}

            {brief.productCategories && brief.productCategories.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {brief.productCategories.map((c) => (
                  <span key={c} style={{ background: '#FFFDF3', color: '#1a1a1a', padding: '3px 8px', fontFamily: 'var(--font-jai-display)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {c}
                  </span>
                ))}
              </div>
            )}

            <p style={{ marginTop: 14, fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.1em', opacity: 0.6 }}>
              URGENCY {brief.urgency}/10 · {brief.lifecycleStage}
            </p>
          </Section>
        )}

        {/* Velocity sparkline */}
        {snapshots.length >= 2 && (
          <Section title="Velocity">
            <Sparkline snapshots={snapshots} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 16 }}>
              <Stat label="Days observed" value={snapshots.length} />
              <Stat label="Peak popularity" value={lifecycle?.peakPopularity ?? '—'} />
              {lifecycle?.daysSincePeak != null && <Stat label="Days since peak" value={lifecycle.daysSincePeak} />}
              <Stat label="Confidence" value={lifecycle?.confidence ?? 'low'} />
            </div>
          </Section>
        )}

        {/* Mindmap */}
        {mindmap && (
          <Section title="Context & connections">
            <MindmapView mindmap={mindmap} />
          </Section>
        )}

        {/* Similar trends */}
        {similar.length > 0 && (
          <Section title="Similar trends (semantic)">
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b6b6b' }}>
              Closest matches in the embedding space — useful for "is this just like X from last month?" checks.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
              {similar.map((s) => (
                <Link key={s.id} href={`/culture-radar/trends/${s.slug}`} style={{ textDecoration: 'none' }}>
                  <div className="jai-card" style={{ padding: 12, background: '#FFFDF3', border: '1px solid #00000020', cursor: 'pointer' }}>
                    <p className="jai-mono-label" style={{ margin: 0, fontSize: 9, color: '#FF1300' }}>
                      SIM {(s.similarity * 100).toFixed(0)}% · {s.category}
                    </p>
                    <p style={{ margin: '4px 0', fontFamily: 'var(--font-jai-display)', fontSize: 14, color: '#000', textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                      {s.name}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#6b6b6b', lineHeight: 1.35 }}>
                      {s.description}{s.description.length >= 140 ? '…' : ''}
                    </p>
                    {s.subculture && (
                      <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-jai-display)', fontSize: 9, letterSpacing: '0.1em', color: '#000' }}>
                        ◇ {s.subculture}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* All example URLs */}
        {trend.exampleUrls.length > 0 && (
          <Section title="Example posts">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
              {trend.exampleUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" style={{
                  fontSize: 11, color: '#000', textDecoration: 'none',
                  padding: '8px 10px', background: '#FAF6E6', borderLeft: '3px solid #000',
                  display: 'block', wordBreak: 'break-all',
                }}>
                  → {new URL(u).hostname}{new URL(u).pathname.slice(0, 40)}
                </a>
              ))}
            </div>
          </Section>
        )}

        {/* Creator matchmaker */}
        {creators.length > 0 && (
          <Section title="Matched creators">
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b6b6b' }}>
              Creators from our tracked cohort whose niche/country/tags match this trend.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {creators.map((c) => (
                <div key={c.handle} className="jai-card" style={{ padding: 12, background: '#FFFDF3', border: '1px solid #00000020' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-jai-display)', fontSize: 14, color: '#000' }}>
                      @{c.handle}
                    </span>
                    <span style={{ fontFamily: 'var(--font-jai-display)', fontSize: 9, letterSpacing: '0.1em', color: '#FF1300' }}>
                      FIT {c.fitScore}
                    </span>
                  </div>
                  {c.followerCount != null && (
                    <p style={{ margin: '2px 0 4px', fontSize: 10, color: '#6b6b6b' }}>
                      {c.followerCount.toLocaleString('en-US')} followers · {c.platform.toUpperCase()}
                    </p>
                  )}
                  {c.niche && (
                    <p style={{ margin: '4px 0', fontSize: 12, color: '#1a1a1a' }}>{c.niche}</p>
                  )}
                  {c.matchReasons.length > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: 10, color: '#FF1300' }}>
                      {c.matchReasons.slice(0, 3).join(' · ')}
                    </p>
                  )}
                  {c.profileUrl && (
                    <a href={c.profileUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontFamily: 'var(--font-jai-display)', fontSize: 9, letterSpacing: '0.1em', color: '#000', textDecoration: 'underline' }}>
                      → PROFILE
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Sources */}
        <Section title="Sources">
          <p style={{ margin: 0, fontSize: 13, color: '#1a1a1a' }}>
            {trend.sourceNames.join(' · ')}
          </p>
          <p style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
            First seen {new Date(trend.firstSeenAt).toLocaleString('nl-NL')}
            {trend.dailyRank ? ` · ranked #${trend.dailyRank} today` : ''}
            {trend.weeklyRank ? ` · #${trend.weeklyRank} this week` : ''}
          </p>
        </Section>
      </div>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

function Section({ title, children, dark = false }: { title: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      marginBottom: 24,
      padding: 20,
      background: dark ? '#000' : '#FFFDF3',
      border: '1px solid ' + (dark ? '#000' : '#00000020'),
      color: dark ? '#FFFDF3' : '#1a1a1a',
    }}>
      <p className="jai-mono-label" style={{ margin: '0 0 12px', color: dark ? '#FF1300' : '#FF1300' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function Pill({ children, highlight = false, subtle = false }: { children: React.ReactNode; highlight?: boolean; subtle?: boolean }) {
  return (
    <span style={{
      fontFamily: 'var(--font-jai-display)',
      fontSize: 9,
      letterSpacing: '0.1em',
      padding: '3px 8px',
      background: highlight ? '#FF1300' : subtle ? 'transparent' : '#FFFDF3',
      color: highlight ? '#FFFDF3' : subtle ? '#FFFDF3' : '#000',
      border: subtle ? '1px solid #FFFDF330' : 'none',
      textTransform: 'uppercase',
    }}>
      {children}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="jai-mono-label" style={{ margin: 0, fontSize: 9, color: '#6b6b6b' }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-jai-display)', fontSize: 18, color: '#000' }}>{value}</p>
    </div>
  )
}

function Sparkline({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null
  const points = snapshots.map((s) => s.popularity_score)
  const max = Math.max(...points, 10)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const w = 100 / (points.length - 1)
  const xy = points.map((p, i) => [i * w, 50 - ((p - min) / range) * 45]).map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <div style={{ background: '#FAF6E6', padding: 16, border: '1px solid #00000020' }}>
      <svg viewBox="0 0 100 50" preserveAspectRatio="none" style={{ width: '100%', height: 100 }}>
        <polyline points={xy} fill="none" stroke="#FF1300" strokeWidth={1.5} />
        {points.map((p, i) => (
          <circle key={i} cx={i * w} cy={50 - ((p - min) / range) * 45} r={1.2} fill="#000" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: 'var(--font-jai-display)', fontSize: 9, letterSpacing: '0.1em', color: '#6b6b6b' }}>
        <span>{snapshots[0].snapshot_date}</span>
        <span>POPULARITY · {min}–{max}</span>
        <span>{snapshots[snapshots.length - 1].snapshot_date}</span>
      </div>
    </div>
  )
}

function MindmapView({ mindmap }: { mindmap: NonNullable<CultureTrend['mindmap']> }) {
  const sections: Array<{ key: keyof typeof mindmap; label: string; emoji: string }> = [
    { key: 'origin', label: 'Origin', emoji: '🌱' },
    { key: 'spreading', label: 'Spreading', emoji: '📡' },
    { key: 'adjacent', label: 'Adjacent', emoji: '🔗' },
    { key: 'variations', label: 'Variations', emoji: '🌀' },
    { key: 'searches', label: 'Searches', emoji: '🔍' },
    { key: 'brandPlays', label: 'Brand plays', emoji: '💼' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
      {sections.map((s) => {
        const items = mindmap[s.key] ?? []
        if (items.length === 0) return null
        return (
          <div key={s.key} style={{ background: '#FAF6E6', borderLeft: '3px solid #000', padding: 10 }}>
            <p className="jai-mono-label" style={{ margin: 0, fontSize: 10, color: '#000' }}>
              {s.emoji} {s.label}
            </p>
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
              {items.map((it, i) => (
                <li key={i} style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 5 }}>
                  <strong>{it.label}</strong>
                  {it.detail && <span style={{ color: '#6b6b6b' }}> — {it.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
