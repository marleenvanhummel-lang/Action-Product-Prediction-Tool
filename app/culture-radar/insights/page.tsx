'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'

interface Cluster {
  size: number
  avgPopularity: number
  avgGrowth: number
  dominantSubculture: string | null
  dominantVibe: string | null
  members: Array<{ id: string; name: string; description: string }>
}

interface ClusterResp { ok: boolean; embeddedTotal: number; k: number; clusters: Cluster[] }

interface SubcultureTraj {
  subculture: string
  thisWeek: { count: number; avgGrowth: number }
  lastWeek: { count: number; avgGrowth: number }
  delta: number
  growthDelta: number
  trajectory: 'rising' | 'fading' | 'stable' | 'new' | 'gone'
  topTrends: string[]
}

interface SourceHealth {
  sourceName: string
  counts: { real: number; generic: number; fabricated: number; uncertain: number; unverified: number; total: number }
  realPct: number | null
  fakePct: number | null
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export default function InsightsPage() {
  const [clusters, setClusters] = useState<ClusterResp | null>(null)
  const [subcultures, setSubcultures] = useState<SubcultureTraj[]>([])
  const [sources, setSources] = useState<SourceHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/culture/clusters?k=12&freshOnly=1').then((r) => r.json()),
      apiFetch('/api/culture/subculture-trajectory').then((r) => r.json()),
      apiFetch('/api/culture/source-health').then((r) => r.json()),
    ]).then(([c, s, src]) => {
      setClusters(c)
      setSubcultures(s.subcultures ?? [])
      setSources(src.sources ?? [])
      setLoading(false)
    }).catch((e) => {
      console.error(e); setLoading(false)
    })
  }, [])

  return (
    <div className="jai-app" style={{ minHeight: '100vh' }}>
      <div style={{ background: '#000', color: '#FFFDF3', padding: '32px 40px 20px' }}>
        <p>
          <Link href="/culture-radar" style={{ color: '#FF1300', textDecoration: 'none', fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.15em' }}>← CULTURE RADAR</Link>
        </p>
        <h1 style={{ margin: '12px 0 0', fontFamily: 'var(--font-jai-display)', fontSize: 48, lineHeight: 0.95, textTransform: 'uppercase', letterSpacing: '-0.025em' }}>
          Insights<span style={{ color: '#FF1300' }}>.</span>
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.7 }}>
          Meta-patterns in the trend data: emerging clusters, rising/fading subcultures, source health.
        </p>
      </div>
      <div style={{ height: 6, background: '#FF1300' }} />

      <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <p className="jai-mono-label" style={{ color: '#FF1300' }}>Loading insights…</p>
        ) : (
          <>
            {/* Clusters */}
            <Section title="Emerging clusters" subtitle="K-means on Gemini embeddings of fresh trends (last 14 days). Each cluster groups trends by semantic similarity — may surface unnamed meta-patterns.">
              {!clusters || clusters.clusters.length === 0 ? (
                <p style={{ color: '#6b6b6b' }}>Not enough embedded trends yet. Embed runs daily via cron.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                  {clusters.clusters.map((c, i) => (
                    <div key={i} className="jai-card" style={{ padding: 14, background: '#FFFDF3', border: '1px solid #00000020' }}>
                      <p className="jai-mono-label" style={{ margin: 0, fontSize: 10, color: '#FF1300' }}>
                        CLUSTER #{i + 1} · {c.size} TRENDS
                      </p>
                      <p style={{ margin: '4px 0 8px', fontSize: 11, color: '#6b6b6b' }}>
                        {c.dominantSubculture && <>◇ {c.dominantSubculture} · </>}
                        {c.dominantVibe && <>{c.dominantVibe} · </>}
                        avg pop {c.avgPopularity}/10 · growth {c.avgGrowth}/10
                      </p>
                      <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                        {c.members.slice(0, 5).map((m) => (
                          <li key={m.id} style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 4, color: '#1a1a1a' }}>
                            <strong>{m.name}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Subculture trajectory */}
            <Section title="Subculture trajectory" subtitle="Per subculture: trend count this week vs last week. Rising / fading / stable / new / gone.">
              {subcultures.length === 0 ? (
                <p style={{ color: '#6b6b6b' }}>No subculture data yet.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                  {subcultures.map((s) => (
                    <SubcultureCard key={s.subculture} s={s} />
                  ))}
                </div>
              )}
            </Section>

            {/* Source health */}
            <Section title="Source health scorecard" subtitle="Per source: what % of trends from this source were verified as real vs fabricated. Helps demote noisy sources.">
              {sources.length === 0 ? (
                <p style={{ color: '#6b6b6b' }}>Run /api/culture/verify-trends first.</p>
              ) : (
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#000', color: '#FFFDF3', fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.1em' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>SOURCE</th>
                        <th style={{ padding: '6px 8px' }}>GRADE</th>
                        <th style={{ padding: '6px 8px' }}>REAL%</th>
                        <th style={{ padding: '6px 8px' }}>FAKE%</th>
                        <th style={{ padding: '6px 8px' }}>TOTAL</th>
                        <th style={{ padding: '6px 8px' }}>FAB</th>
                        <th style={{ padding: '6px 8px' }}>GEN</th>
                        <th style={{ padding: '6px 8px' }}>UNV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((src) => (
                        <tr key={src.sourceName} style={{ borderBottom: '1px solid #00000010' }}>
                          <td style={{ padding: '6px 8px', maxWidth: 320 }}>{src.sourceName}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span style={{
                              fontFamily: 'var(--font-jai-display)', fontSize: 11,
                              padding: '2px 7px',
                              background: gradeColor(src.healthGrade),
                              color: '#FFFDF3',
                            }}>
                              {src.healthGrade}
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#047857' }}>{src.realPct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#b91c1c' }}>{src.fakePct ?? '—'}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{src.counts.total}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#b91c1c' }}>{src.counts.fabricated}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#a16207' }}>{src.counts.generic}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: '#9ca3af' }}>{src.counts.unverified}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-jai-display)', fontSize: 24, color: '#000', textTransform: 'uppercase', letterSpacing: '-0.01em' }}>
          {title}<span style={{ color: '#FF1300' }}>.</span>
        </span>
        {subtitle && <span style={{ fontSize: 11, color: '#6b6b6b', maxWidth: 540 }}>{subtitle}</span>}
        <div style={{ flex: 1, height: 1, background: '#00000020' }} />
      </div>
      {children}
    </div>
  )
}

function SubcultureCard({ s }: { s: SubcultureTraj }) {
  const colors: Record<string, { bg: string; fg: string; emoji: string }> = {
    rising:  { bg: '#FF1300', fg: '#FFFDF3', emoji: '↗' },
    fading:  { bg: '#9ca3af', fg: '#FFFDF3', emoji: '↘' },
    new:     { bg: '#000',    fg: '#FF1300', emoji: '✨' },
    gone:    { bg: '#FFFDF3', fg: '#9ca3af', emoji: '×' },
    stable:  { bg: '#FFFDF3', fg: '#000',    emoji: '→' },
  }
  const c = colors[s.trajectory]
  return (
    <div className="jai-card" style={{ padding: 12, background: '#FFFDF3', border: '1px solid #00000020' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-jai-display)', fontSize: 13, color: '#000', textTransform: 'uppercase' }}>
          ◇ {s.subculture}
        </span>
        <span style={{ fontFamily: 'var(--font-jai-display)', fontSize: 10, letterSpacing: '0.1em', padding: '2px 7px', background: c.bg, color: c.fg, border: c.bg === '#FFFDF3' ? '1px solid #00000020' : 'none' }}>
          {c.emoji} {s.trajectory.toUpperCase()}
        </span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#6b6b6b' }}>
        This week <strong style={{ color: '#000' }}>{s.thisWeek.count}</strong> trends · last week {s.lastWeek.count}
        {s.delta !== 0 && <span style={{ color: s.delta > 0 ? '#FF1300' : '#6b6b6b' }}> ({s.delta > 0 ? '+' : ''}{s.delta})</span>}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b6b6b' }}>
        avg growth {s.thisWeek.avgGrowth} vs {s.lastWeek.avgGrowth}
      </p>
      {s.topTrends.length > 0 && (
        <ul style={{ margin: '6px 0 0', padding: '0 0 0 18px' }}>
          {s.topTrends.slice(0, 3).map((t) => (
            <li key={t} style={{ fontSize: 11, lineHeight: 1.3, marginBottom: 2, color: '#1a1a1a' }}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function gradeColor(g: string): string {
  if (g === 'A') return '#047857'
  if (g === 'B') return '#000'
  if (g === 'C') return '#a16207'
  if (g === 'D') return '#c2410c'
  return '#b91c1c'
}
