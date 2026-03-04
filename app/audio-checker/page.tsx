'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'

interface AudioResult {
  url: string
  verdict: 'safe' | 'uncertain' | 'risky'
  verdictNL: string
  audioName: string
  audioType: string
  explanation: string
  recommendation: string
  creator?: string
  error?: string
}

const VERDICT_CONFIG = {
  safe: {
    bg: '#f0fdf4',
    border: '#bbf7d0',
    color: '#15803d',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    label: 'Veilig',
  },
  uncertain: {
    bg: '#fefce8',
    border: '#fde68a',
    color: '#d97706',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    label: 'Onzeker',
  },
  risky: {
    bg: '#fef2f2',
    border: '#fecaca',
    color: '#dc2626',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    label: 'Risico',
  },
}

function AudioTypeChip({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    'Original sound': { bg: '#eff6ff', color: '#1d4ed8' },
    'Commercieel nummer': { bg: '#fef2f2', color: '#dc2626' },
    'Meta bibliotheek': { bg: '#f0fdf4', color: '#15803d' },
    'Onbekend': { bg: '#f3f4f6', color: '#6b7280' },
  }
  const style = colors[type] ?? colors['Onbekend']
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {type}
    </span>
  )
}

function ResultCard({ result }: { result: AudioResult }) {
  const isError = !!result.error && !result.audioName
  const verdict = result.verdict ?? 'uncertain'
  const cfg = VERDICT_CONFIG[verdict]

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3"
      style={{
        backgroundColor: isError ? '#f9fafb' : cfg.bg,
        borderColor: isError ? '#e5e7eb' : cfg.border,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ fontFamily: 'var(--font-body)', color: '#111318' }}
          >
            {result.audioName || 'Onbekend audio'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {result.audioType && <AudioTypeChip type={result.audioType} />}
            {result.creator && (
              <span className="text-xs" style={{ color: '#6b7280' }}>
                door @{result.creator}
              </span>
            )}
          </div>
        </div>

        {!isError ? (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: cfg.color + '1a', color: cfg.color }}
          >
            {cfg.icon}
            {cfg.label}
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Fout
          </div>
        )}
      </div>

      {result.explanation && (
        <p className="text-sm" style={{ color: '#374151', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
          {result.explanation}
        </p>
      )}
      {isError && (
        <p className="text-sm" style={{ color: '#6b7280', fontFamily: 'var(--font-body)' }}>
          {result.error}
        </p>
      )}

      <div className="flex items-start justify-between gap-3 pt-1 border-t" style={{ borderColor: isError ? '#e5e7eb' : cfg.border }}>
        {result.recommendation && (
          <p className="text-xs" style={{ color: '#6b7280', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            <span className="font-medium" style={{ color: '#374151' }}>Advies: </span>
            {result.recommendation}
          </p>
        )}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium whitespace-nowrap flex items-center gap-1 flex-shrink-0"
          style={{ color: 'var(--action-red)', fontFamily: 'var(--font-body)' }}
        >
          Bekijk reel
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  )
}

function ResultsSummary({ results, label }: { results: AudioResult[]; label: string }) {
  const safeCount = results.filter((r) => r.verdict === 'safe').length
  const riskyCount = results.filter((r) => r.verdict === 'risky').length
  const uncertainCount = results.filter((r) => r.verdict === 'uncertain').length
  return (
    <div
      className="rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap"
      style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
    >
      <p className="text-sm font-semibold flex-1" style={{ fontFamily: 'var(--font-body)', color: '#374151' }}>
        {label}
      </p>
      <div className="flex items-center gap-3 text-xs font-medium" style={{ fontFamily: 'var(--font-body)' }}>
        {safeCount > 0 && (
          <span className="flex items-center gap-1" style={{ color: '#15803d' }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#15803d' }} />
            {safeCount} veilig
          </span>
        )}
        {uncertainCount > 0 && (
          <span className="flex items-center gap-1" style={{ color: '#d97706' }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#d97706' }} />
            {uncertainCount} onzeker
          </span>
        )}
        {riskyCount > 0 && (
          <span className="flex items-center gap-1" style={{ color: '#dc2626' }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#dc2626' }} />
            {riskyCount} risico
          </span>
        )}
      </div>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border px-4 py-3 mb-6 flex items-start gap-3"
      style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p className="text-sm" style={{ color: '#991b1b', fontFamily: 'var(--font-body)' }}>{message}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border px-6 py-10 text-center"
      style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
    >
      <p className="text-sm" style={{ color: '#6b7280', fontFamily: 'var(--font-body)' }}>
        Geen resultaten ontvangen. Probeer opnieuw.
      </p>
    </div>
  )
}

function Disclaimer() {
  return (
    <p
      className="text-xs text-center pb-4"
      style={{ color: '#9ca3af', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
    >
      Dit is een AI-beoordeling, geen juridisch advies. Bij twijfel, controleer altijd handmatig via{' '}
      <a
        href="https://www.instagram.com/music/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--action-red)' }}
      >
        Instagram Music
      </a>
      {' '}of raadpleeg je rechtenteam.
    </p>
  )
}

export default function AudioCheckerPage() {
  const [mode, setMode] = useState<'reels' | 'account'>('reels')

  // Reels mode
  const [reelInput, setReelInput] = useState('')
  const [reelResults, setReelResults] = useState<AudioResult[] | null>(null)
  const [reelLoading, setReelLoading] = useState(false)
  const [reelError, setReelError] = useState<string | null>(null)

  // Account mode
  const [username, setUsername] = useState('')
  const [accountResults, setAccountResults] = useState<{ username: string; results: AudioResult[] } | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  // ── Reels mode ───────────────────────────────────────────────────────────────

  const urls = reelInput
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.length > 0)

  const reelValidationError =
    urls.length > 5
      ? 'Maximum 5 URLs per keer.'
      : urls.some((u) => !u.includes('instagram.com'))
      ? 'Alleen Instagram URLs zijn toegestaan.'
      : null

  async function handleCheckReels() {
    if (!urls.length || reelValidationError) return
    setReelLoading(true)
    setReelError(null)
    setReelResults(null)
    try {
      const res = await apiFetch('/api/audio-checker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      const data = await res.json()
      if (!res.ok) setReelError(data.error ?? 'Er is een fout opgetreden.')
      else setReelResults(data.results)
    } catch {
      setReelError('Netwerkfout — controleer je verbinding en probeer opnieuw.')
    } finally {
      setReelLoading(false)
    }
  }

  // ── Account mode ─────────────────────────────────────────────────────────────

  const cleanUsername = username.replace('@', '').trim()

  async function handleScanAccount() {
    if (!cleanUsername) return
    setAccountLoading(true)
    setAccountError(null)
    setAccountResults(null)
    try {
      const res = await apiFetch('/api/audio-checker/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername }),
      })
      const data = await res.json()
      if (!res.ok) setAccountError(data.error ?? 'Er is een fout opgetreden.')
      else setAccountResults({ username: data.username, results: data.results })
    } catch {
      setAccountError('Netwerkfout — controleer je verbinding en probeer opnieuw.')
    } finally {
      setAccountLoading(false)
    }
  }

  function switchMode(next: 'reels' | 'account') {
    setMode(next)
    setReelError(null)
    setAccountError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--action-red)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <div>
              <h1
                className="text-2xl font-bold leading-none"
                style={{ fontFamily: 'var(--font-display)', color: '#111318', letterSpacing: '0.01em' }}
              >
                Audio Copyright Checker
              </h1>
              <p className="text-sm mt-0.5" style={{ color: '#6b7280', fontFamily: 'var(--font-body)' }}>
                Controleer of Instagram audio veilig is voor Action content
              </p>
            </div>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-xl p-1 mb-5" style={{ backgroundColor: '#e5e7eb' }}>
          {(['reels', 'account'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                fontFamily: 'var(--font-body)',
                backgroundColor: mode === m ? '#ffffff' : 'transparent',
                color: mode === m ? '#111318' : '#6b7280',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {m === 'reels' ? 'Reels checken' : 'Account scannen'}
            </button>
          ))}
        </div>

        {/* ── Reels tab ───────────────────────────────────────────────────────── */}
        {mode === 'reels' && (
          <>
            <div
              className="rounded-2xl border p-6 mb-6"
              style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
            >
              <label
                className="block text-sm font-semibold mb-2"
                style={{ fontFamily: 'var(--font-body)', color: '#374151' }}
              >
                Instagram Reel URLs
              </label>
              <p className="text-xs mb-3" style={{ color: '#9ca3af', fontFamily: 'var(--font-body)' }}>
                Plak één URL per regel — maximaal 5 Reels per controle
              </p>
              <textarea
                value={reelInput}
                onChange={(e) => setReelInput(e.target.value)}
                placeholder={'https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/reel/XYZ456/'}
                rows={5}
                className="w-full rounded-lg border px-3 py-2.5 text-sm resize-none outline-none transition-colors"
                style={{
                  fontFamily: 'var(--font-body)',
                  borderColor: reelValidationError ? '#fca5a5' : '#d1d5db',
                  backgroundColor: '#f9fafb',
                  color: '#111318',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = reelValidationError ? '#ef4444' : 'var(--action-red)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = reelValidationError ? '#fca5a5' : '#d1d5db' }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs" style={{ color: reelValidationError ? '#dc2626' : '#9ca3af' }}>
                  {reelValidationError ?? (urls.length > 0 ? `${urls.length} URL${urls.length > 1 ? 's' : ''} ingevoerd` : ' ')}
                </span>
                <span className="text-xs" style={{ color: '#9ca3af' }}>{urls.length}/5</span>
              </div>
              <button
                onClick={handleCheckReels}
                disabled={reelLoading || !urls.length || !!reelValidationError}
                className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  fontFamily: 'var(--font-body)',
                  backgroundColor: reelLoading || !urls.length || reelValidationError ? '#f3f4f6' : 'var(--action-red)',
                  color: reelLoading || !urls.length || reelValidationError ? '#9ca3af' : '#ffffff',
                  cursor: reelLoading || !urls.length || reelValidationError ? 'not-allowed' : 'pointer',
                }}
              >
                {reelLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Audio wordt geanalyseerd…
                  </span>
                ) : (
                  'Controleer audio'
                )}
              </button>
            </div>

            {reelError && <ErrorBanner message={reelError} />}

            {reelResults && reelResults.length > 0 && (
              <div className="flex flex-col gap-4">
                <ResultsSummary
                  results={reelResults}
                  label={`${reelResults.length} Reel${reelResults.length > 1 ? 's' : ''} geanalyseerd`}
                />
                {reelResults.map((r, i) => <ResultCard key={i} result={r} />)}
                <Disclaimer />
              </div>
            )}
            {reelResults && reelResults.length === 0 && <EmptyState />}
          </>
        )}

        {/* ── Account tab ─────────────────────────────────────────────────────── */}
        {mode === 'account' && (
          <>
            <div
              className="rounded-2xl border p-6 mb-6"
              style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}
            >
              <label
                className="block text-sm font-semibold mb-2"
                style={{ fontFamily: 'var(--font-body)', color: '#374151' }}
              >
                Instagram gebruikersnaam
              </label>
              <p className="text-xs mb-3" style={{ color: '#9ca3af', fontFamily: 'var(--font-body)' }}>
                Vul een openbaar account in — alle recente reels worden gescand op audio-gebruik
              </p>

              <div
                className="flex items-center rounded-lg border overflow-hidden"
                style={{ borderColor: '#d1d5db', backgroundColor: '#f9fafb' }}
              >
                <span
                  className="px-3 py-2.5 text-sm select-none border-r flex-shrink-0"
                  style={{ color: '#9ca3af', borderColor: '#d1d5db', fontFamily: 'var(--font-body)' }}
                >
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScanAccount() }}
                  placeholder="action_nederland"
                  className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent"
                  style={{ fontFamily: 'var(--font-body)', color: '#111318' }}
                />
              </div>

              <button
                onClick={handleScanAccount}
                disabled={accountLoading || !cleanUsername}
                className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  fontFamily: 'var(--font-body)',
                  backgroundColor: accountLoading || !cleanUsername ? '#f3f4f6' : 'var(--action-red)',
                  color: accountLoading || !cleanUsername ? '#9ca3af' : '#ffffff',
                  cursor: accountLoading || !cleanUsername ? 'not-allowed' : 'pointer',
                }}
              >
                {accountLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Account wordt gescand… (kan 1–2 min duren)
                  </span>
                ) : (
                  'Scan account'
                )}
              </button>
            </div>

            {accountError && <ErrorBanner message={accountError} />}

            {accountResults && accountResults.results.length > 0 && (
              <div className="flex flex-col gap-4">
                <ResultsSummary
                  results={accountResults.results}
                  label={`@${accountResults.username} — ${accountResults.results.length} reel${accountResults.results.length > 1 ? 's' : ''} gescand`}
                />
                {accountResults.results.map((r, i) => <ResultCard key={i} result={r} />)}
                <Disclaimer />
              </div>
            )}
            {accountResults && accountResults.results.length === 0 && <EmptyState />}
          </>
        )}

      </div>
    </div>
  )
}
