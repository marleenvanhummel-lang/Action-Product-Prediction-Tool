'use client'

/**
 * Live progress panel for an ongoing Culture Radar scrape job.
 *
 * State lives entirely in the DB (culture_scrape_jobs) so progress
 * survives page refresh / tab close / browser restart. This component:
 *
 * - On mount: looks for an active job (DB query) or a remembered job
 *   ID in localStorage. If found, starts polling /scrape/status.
 * - Polls every 2 seconds while a job is running.
 * - Stops polling when the job reports status !== 'running'.
 * - Renders nothing if there's no job to show (panel auto-hides).
 *
 * Used from /culture-radar dashboard. Can be embedded anywhere — it
 * mounts itself based on server state alone, no props required.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

const LS_KEY = 'culture-radar:active-scrape-job-id'
const POLL_INTERVAL_MS = 2000

interface JobState {
  id: string
  runId: string
  triggeredBy: string | null
  status: 'running' | 'done' | 'failed' | string
  kind: string | null
  startedAt: string
  finishedAt: string | null
  sourcesTotal: number
  sourcesDone: number
  sourcesOk: number
  sourcesFailed: number
  currentSourceName: string | null
  error: string | null
  elapsedMs: number
}

interface ResultRow {
  source_name: string
  status: string
  error: string | null
  scraped_at: string
}

interface StatusResponse {
  job: JobState | null
  recentResults: ResultRow[]
}

interface Props {
  /** Optional: if provided, force-track this specific job. */
  jobId?: string | null
  /** Hide entirely when there's no active or finished job to show. Default true. */
  autoHideWhenIdle?: boolean
}

export function ScrapeProgressPanel({ jobId: externalJobId, autoHideWhenIdle = true }: Props) {
  const [job, setJob] = useState<JobState | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const pollTimer = useRef<NodeJS.Timeout | null>(null)

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  // Initial mount: figure out which job to track.
  // Priority: explicit prop → localStorage → server's active job.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (externalJobId) {
        setTrackedJobId(externalJobId)
        try { localStorage.setItem(LS_KEY, externalJobId) } catch { /* private mode */ }
        return
      }
      try {
        const stored = localStorage.getItem(LS_KEY)
        if (stored) {
          // Validate it still exists / matches a job we can read
          const res = await apiFetch(`/api/culture/scrape/status?jobId=${stored}`)
          if (!cancelled && res.ok) {
            const data = (await res.json()) as StatusResponse
            if (data.job) {
              setTrackedJobId(stored)
              return
            }
          }
          // Stale entry — drop it
          localStorage.removeItem(LS_KEY)
        }
      } catch { /* fall through to active lookup */ }
      try {
        const res = await apiFetch('/api/culture/scrape/status?active=1')
        if (!cancelled && res.ok) {
          const data = (await res.json()) as StatusResponse
          if (data.job) {
            setTrackedJobId(data.job.id)
            try { localStorage.setItem(LS_KEY, data.job.id) } catch { /* */ }
          }
        }
      } catch { /* nothing running — panel stays idle */ }
    })()
    return () => { cancelled = true }
  }, [externalJobId])

  // Poll whenever we have a tracked job.
  const fetchStatus = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/culture/scrape/status?jobId=${id}`)
      if (!res.ok) return
      const data = (await res.json()) as StatusResponse
      setJob(data.job)
      setResults(data.recentResults)
      if (data.job && data.job.status !== 'running') {
        clearPoll()
        // Keep showing the final summary for a while but drop the LS pin
        try { localStorage.removeItem(LS_KEY) } catch { /* */ }
      }
    } catch { /* transient network — keep polling */ }
  }, [clearPoll])

  useEffect(() => {
    if (!trackedJobId) return
    fetchStatus(trackedJobId)
    pollTimer.current = setInterval(() => fetchStatus(trackedJobId), POLL_INTERVAL_MS)
    return clearPoll
  }, [trackedJobId, fetchStatus, clearPoll])

  // Reset dismiss when a new job starts
  useEffect(() => { setDismissed(false) }, [trackedJobId])

  if (!job && autoHideWhenIdle) return null
  if (dismissed) return null

  const pct = job && job.sourcesTotal > 0
    ? Math.round((job.sourcesDone / job.sourcesTotal) * 100)
    : 0
  const elapsedSec = job ? Math.round(job.elapsedMs / 1000) : 0
  const elapsedStr = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`
  const isRunning = job?.status === 'running'

  // Estimated time remaining (very rough — linear extrapolation)
  let etaStr = ''
  if (job && isRunning && job.sourcesDone > 0 && job.sourcesDone < job.sourcesTotal) {
    const msPerSource = job.elapsedMs / job.sourcesDone
    const remainingMs = (job.sourcesTotal - job.sourcesDone) * msPerSource
    const remainingSec = Math.round(remainingMs / 1000)
    etaStr = remainingSec < 60 ? `~${remainingSec}s left` : `~${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s left`
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      width: 420,
      maxWidth: 'calc(100vw - 48px)',
      background: '#FFFDF3',
      border: '2px solid #000',
      borderRadius: 4,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      zIndex: 1000,
      fontFamily: 'Inter, -apple-system, sans-serif',
      fontSize: 13,
    }}>
      {/* Header */}
      <div style={{
        background: isRunning ? '#000' : (job?.status === 'failed' ? '#FF1300' : '#000'),
        color: '#FFFDF3',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRunning && (
            <span style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#FF1300',
              animation: 'pulse 1s ease-in-out infinite',
            }} />
          )}
          {isRunning ? 'Scraping…' : job?.status === 'failed' ? 'Scrape failed' : 'Scrape complete'}
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Close"
          style={{
            background: 'transparent', border: 'none', color: '#FFFDF3',
            fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: 14 }}>
        {!job && (
          <div style={{ color: '#555' }}>Loading…</div>
        )}
        {job && (
          <>
            {/* Counters */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 10 }}>
              <Stat label="Done" value={`${job.sourcesDone}/${job.sourcesTotal}`} />
              <Stat label="OK" value={job.sourcesOk} color="#0a7d28" />
              <Stat label="Failed" value={job.sourcesFailed} color={job.sourcesFailed > 0 ? '#FF1300' : '#888'} />
              <Stat label="Elapsed" value={elapsedStr} />
            </div>

            {/* Progress bar */}
            <div style={{
              height: 8,
              background: '#EBE7DC',
              borderRadius: 4,
              overflow: 'hidden',
              marginBottom: 8,
            }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: isRunning ? '#FF1300' : '#0a7d28',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#666', marginBottom: 12 }}>
              <span>{pct}%</span>
              {etaStr && <span>{etaStr}</span>}
            </div>

            {/* Current source */}
            {isRunning && job.currentSourceName && (
              <div style={{
                background: '#F4F1E8',
                padding: '8px 10px',
                borderRadius: 3,
                fontSize: 12,
                marginBottom: 10,
              }}>
                <span style={{ color: '#666' }}>Now: </span>
                <strong>{job.currentSourceName}</strong>
              </div>
            )}

            {/* Recent results scroll */}
            {results.length > 0 && (
              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                borderTop: '1px solid #DDD',
                paddingTop: 8,
              }}>
                {results.map((r, i) => (
                  <div key={`${r.source_name}-${i}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 0',
                    fontSize: 11.5,
                    borderBottom: i < results.length - 1 ? '1px dashed #EEE' : 'none',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      width: 6, height: 6, borderRadius: '50%',
                      background: r.status === 'ok' ? '#0a7d28' : '#FF1300',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{r.source_name}</span>
                    {r.error && (
                      <span style={{
                        color: '#FF1300',
                        fontSize: 10,
                        maxWidth: 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }} title={r.error}>{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Final summary */}
            {!isRunning && (
              <div style={{
                marginTop: 10,
                padding: '8px 10px',
                background: job.status === 'failed' ? '#FFE5E0' : '#E8F4EA',
                borderRadius: 3,
                fontSize: 12,
              }}>
                {job.status === 'failed' ? (
                  <strong>Failed: {job.error ?? 'unknown error'}</strong>
                ) : (
                  <>Done in {elapsedStr}. {job.sourcesOk} ok, {job.sourcesFailed} failed.</>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? '#000' }}>{value}</div>
    </div>
  )
}
