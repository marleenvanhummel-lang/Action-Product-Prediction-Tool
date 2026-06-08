'use client'

/**
 * ConfidenceDisc — a small circular badge showing the confidence score
 * (0-100) for a trend. Clickable: opens the trust panel.
 *
 * Colour-coded:
 *   >= 70 black (confident)
 *   40-69 red (#FF1300 — caution)
 *   <  40 cream with red border (low trust)
 *
 * Behind `FLAG_VNEXT_CONFIDENCE` feature flag.
 */
import { useState } from 'react'
import { TrustPanel } from './TrustPanel'

interface Props {
  trendId: string
  score: number | null
  size?: number
}

export function ConfidenceDisc({ trendId, score, size = 44 }: Props) {
  const [open, setOpen] = useState(false)

  const display = score == null ? '–' : Math.round(score)
  const tier = score == null
    ? 'unknown'
    : score >= 70
      ? 'high'
      : score >= 40
        ? 'medium'
        : 'low'

  const colors = TIER_COLORS[tier]

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={`Confidence: ${display}${score == null ? '' : '/100'}${
          score == null ? ' (not yet computed)' : ''
        }`}
        aria-label={`Confidence ${display}, open trust panel`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: colors.bg,
          color: colors.fg,
          border: `2px solid ${colors.border}`,
          fontFamily: 'var(--font-jai-display), Archivo Black, sans-serif',
          fontWeight: 900,
          fontSize: Math.round(size * 0.42),
          lineHeight: 1,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          letterSpacing: '-0.02em',
        }}
      >
        {display}
      </button>
      {open && (
        <TrustPanel
          trendId={trendId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

const TIER_COLORS = {
  high:    { bg: '#000000', fg: '#FFFDF3', border: '#000000' },
  medium:  { bg: '#FF1300', fg: '#FFFDF3', border: '#FF1300' },
  low:     { bg: '#FFFDF3', fg: '#FF1300', border: '#FF1300' },
  unknown: { bg: '#EEEAE0', fg: '#666666', border: '#CCCCCC' },
} as const
