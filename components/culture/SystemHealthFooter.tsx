'use client'

/**
 * SystemHealthFooter — bottom-of-page summary of pipeline status.
 *
 * Renders: last refresh age, sources OK/total, review queue count.
 * Used on dashboard, magazine bottom (server-rendered variant).
 *
 * Behind `FLAG_VNEXT_SYSTEM_BANNERS` feature flag.
 */
import { useEffect, useState } from 'react'

interface Health {
  ageHours: number | null
  stale: boolean
  degraded: boolean
  lastRun: { startedAt: string; sourcesOk: number; sourcesAttempted: number } | null
  sourceHealth: { ok: number; total: number }
  reviewQueueCount: number
}

export function SystemHealthFooter() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/culture/v2/system-health')
      .then((r) => r.json())
      .then((d: Health) => {
        if (!cancelled) setHealth(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (!health) return null

  return (
    <footer
      role="contentinfo"
      style={{
        padding: '14px 24px',
        background: '#000',
        color: '#FFFDF3',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginTop: 40,
      }}
    >
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Item label="Data age" value={health.ageHours !== null ? `${health.ageHours}h` : '—'} status={health.stale ? 'warn' : 'ok'} />
        <Item label="Sources" value={`${health.sourceHealth.ok}/${health.sourceHealth.total}`} status={health.degraded ? 'warn' : 'ok'} />
        <Item label="Review queue" value={String(health.reviewQueueCount)} status={health.reviewQueueCount > 20 ? 'warn' : 'ok'} />
        {health.lastRun && (
          <Item
            label="Last refresh"
            value={new Date(health.lastRun.startedAt).toLocaleString('en-GB', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            status="ok"
          />
        )}
      </div>
      <div style={{ color: '#666', fontSize: 10, letterSpacing: '0.06em' }}>
        Culture Radar vNext · live system health
      </div>
    </footer>
  )
}

function Item({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: 'ok' | 'warn'
}) {
  const dot = status === 'warn' ? '#FF1300' : '#3DD68C'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: 3,
          background: dot,
        }}
      />
      <span style={{ color: '#999', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ color: '#FFFDF3', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
