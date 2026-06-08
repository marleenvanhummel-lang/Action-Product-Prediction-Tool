'use client'

/**
 * DataFreshnessBanner — shown at the top of the dashboard when system
 * health indicates stale or degraded data.
 *
 *  - 0-18h ago:    hidden (system is healthy)
 *  - 18-30h ago:   yellow, "Data is X hours old"
 *  - >30h ago:     red, "Data is stale — trigger a refresh"
 *
 * Also surfaces degradation: if the last cron run failed >10% of its
 * sources, a separate amber banner appears.
 *
 * Behind `FLAG_VNEXT_SYSTEM_BANNERS` feature flag.
 */
import { useEffect, useState } from 'react'

interface Health {
  ageHours: number | null
  stale: boolean
  degraded: boolean
  lastRun: {
    startedAt: string
    sourcesAttempted: number
    sourcesOk: number
    sourcesFailed: number
  } | null
  sourceHealth: { ok: number; total: number }
  reviewQueueCount: number
}

export function DataFreshnessBanner() {
  const [health, setHealth] = useState<Health | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/culture/v2/system-health')
        if (!res.ok) return
        const d = (await res.json()) as Health
        if (!cancelled) setHealth(d)
      } catch {
        // swallow — banner just stays hidden
      }
    }
    load()
    const t = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  if (!health || dismissed) return null

  const showStale = health.ageHours !== null && health.ageHours > 18
  const showDegraded = health.degraded
  const veryStale = health.ageHours !== null && health.ageHours > 30

  if (!showStale && !showDegraded) return null

  const bg = veryStale ? '#FF1300' : showStale ? '#FFB300' : '#FFB300'
  const fg = veryStale ? '#FFFDF3' : '#000'

  return (
    <div
      role="status"
      style={{
        background: bg,
        color: fg,
        padding: '10px 24px',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {showStale && (
          <span>
            <strong>{veryStale ? '🚨 Data is very stale' : '⚠️ Data is stale'}</strong>{' '}
            — last refresh was {health.ageHours} hours ago
          </span>
        )}
        {showDegraded && health.lastRun && (
          <span>
            <strong>⚠️ Degraded run</strong>{' '}
            — {health.lastRun.sourcesFailed}/{health.lastRun.sourcesAttempted} sources failed
          </span>
        )}
        <a
          href="/culture-radar/insights"
          style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 600 }}
        >
          View source health →
        </a>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          fontSize: 18,
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
