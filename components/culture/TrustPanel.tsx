'use client'

/**
 * TrustPanel — a drawer that explains why we believe a trend is real.
 *
 * Shows:
 *   - Confidence score + breakdown (6 inputs with their contributions)
 *   - Source list with reliability rating
 *   - Verifier A vs B verdicts and reasoning
 *   - Article-date verdict
 *   - Manual validation status
 *
 * Opens from ConfidenceDisc or any other anchor that passes trendId.
 * Behind `FLAG_VNEXT_TRUST_PANEL` feature flag.
 */
import { useEffect, useState } from 'react'

interface Props {
  trendId: string
  onClose: () => void
}

interface ConfidenceResponse {
  trendId: string
  confidence: {
    total: number
    breakdown: {
      sourceDiversity: number
      sourceReliability: number
      crossCountrySpread: number
      articleDateFreshness: number
      manualValidation: number
      verifierAgreement: number
    }
    computedAt: string
    inputsHash: string
  }
  inputs: {
    sourceCount: number
    distinctSourceCategories: number
    meanReliability: number
    countryRelevance: string[]
    articleDateVerdict: string | null
    manualValidationStatus: string | null
    verifierAgreement: 'both' | 'one' | 'none'
  }
}

const BREAKDOWN_LABELS: Array<[keyof ConfidenceResponse['confidence']['breakdown'], string, number]> = [
  ['sourceDiversity', 'Source diversity', 30],
  ['sourceReliability', 'Source reliability', 25],
  ['crossCountrySpread', 'Cross-country spread', 15],
  ['articleDateFreshness', 'Article date freshness', 15],
  ['manualValidation', 'Manual validation', 10],
  ['verifierAgreement', 'Verifier agreement', 5],
]

export function TrustPanel({ trendId, onClose }: Props) {
  const [data, setData] = useState<ConfidenceResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/culture/v2/confidence?id=${trendId}`)
      .then((r) => r.json())
      .then((d: ConfidenceResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [trendId])

  return (
    <div
      role="dialog"
      aria-label="Trust panel"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 2000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: '95vw',
          background: '#FFFDF3',
          height: '100vh',
          overflowY: 'auto',
          padding: 24,
          fontFamily: 'Inter, -apple-system, sans-serif',
          fontSize: 13,
          color: '#000',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'var(--font-jai-display), Archivo Black, sans-serif',
            fontSize: 22,
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
          }}>
            Trust panel
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ color: '#FF1300', marginBottom: 12 }}>
            Could not load trust data: {error}
          </div>
        )}

        {!data && !error && (
          <div style={{ color: '#666' }}>Computing confidence…</div>
        )}

        {data && (
          <>
            <ConfidenceHeader total={data.confidence.total} />
            <BreakdownChart breakdown={data.confidence.breakdown} />
            <InputsSummary inputs={data.inputs} />
            <Disclaimer computedAt={data.confidence.computedAt} />
          </>
        )}
      </div>
    </div>
  )
}

function ConfidenceHeader({ total }: { total: number }) {
  const tier = total >= 70 ? 'high' : total >= 40 ? 'medium' : 'low'
  const tierColor = tier === 'high' ? '#000' : tier === 'medium' ? '#FF1300' : '#999'
  const tierLabel = tier === 'high' ? 'High trust' : tier === 'medium' ? 'Caution' : 'Low trust'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 12,
      marginBottom: 18,
      paddingBottom: 12,
      borderBottom: '2px solid #000',
    }}>
      <div style={{
        fontFamily: 'var(--font-jai-display), Archivo Black, sans-serif',
        fontSize: 52,
        lineHeight: 1,
        letterSpacing: '-0.04em',
        color: tierColor,
      }}>{total}</div>
      <div>
        <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Confidence
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: tierColor }}>
          {tierLabel}
        </div>
      </div>
    </div>
  )
}

function BreakdownChart({
  breakdown,
}: {
  breakdown: ConfidenceResponse['confidence']['breakdown']
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{
        margin: '0 0 8px 0',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#666',
      }}>
        Breakdown
      </h3>
      {BREAKDOWN_LABELS.map(([key, label, max]) => {
        const value = breakdown[key]
        const pct = max ? (value / max) * 100 : 0
        return (
          <div key={key} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{label}</span>
              <span style={{ fontWeight: 600 }}>{value} / {max}</span>
            </div>
            <div style={{
              height: 6,
              background: '#EEEAE0',
              borderRadius: 3,
              overflow: 'hidden',
              marginTop: 2,
            }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: pct >= 60 ? '#000' : pct >= 30 ? '#FF1300' : '#CCC',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InputsSummary({ inputs }: { inputs: ConfidenceResponse['inputs'] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{
        margin: '0 0 8px 0',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#666',
      }}>
        Underlying inputs
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <tbody>
          <Row label="Sources" value={`${inputs.sourceCount} total`} />
          <Row label="Distinct source categories" value={`${inputs.distinctSourceCategories}`} />
          <Row label="Mean source reliability" value={inputs.meanReliability.toFixed(1)} />
          <Row label="Country relevance" value={inputs.countryRelevance.join(', ') || '—'} />
          <Row label="Article-date verdict" value={inputs.articleDateVerdict ?? 'not checked'} />
          <Row label="Manual validation" value={inputs.manualValidationStatus ?? 'pending'} />
          <Row label="Verifier agreement" value={inputs.verifierAgreement} />
        </tbody>
      </table>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td style={{ padding: '4px 0', color: '#666' }}>{label}</td>
      <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 500 }}>{value}</td>
    </tr>
  )
}

function Disclaimer({ computedAt }: { computedAt: string }) {
  const dt = new Date(computedAt)
  return (
    <div style={{ fontSize: 10, color: '#999', borderTop: '1px solid #EEE', paddingTop: 10 }}>
      Computed at {dt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.
      Formula and weights documented in
      <code style={{ marginLeft: 4, fontSize: 10 }}>docs/culture-radar-vnext-prd.md §7</code>.
    </div>
  )
}
