'use client'

/**
 * DecisionStateMenu — pill + dropdown for changing a trend's
 * decision state. Only valid next states are shown.
 *
 * When a transition into `activate` or `archive` is selected,
 * the menu prompts for a rationale before posting.
 *
 * Behind `FLAG_VNEXT_DECISION_STATE` feature flag.
 */
import { useState } from 'react'
import {
  allowedNextStates,
  rationaleRequired,
  STATE_COLORS,
  STATE_LABELS,
  STATE_DESCRIPTIONS,
} from '@/lib/decision/states'
import type { DecisionState } from '@/types/decision'

interface Props {
  trendId: string
  currentState: DecisionState
  onChanged?: (newState: DecisionState) => void
}

export function DecisionStateMenu({ trendId, currentState, onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<DecisionState>(currentState)

  const next = allowedNextStates(state)
  const colors = STATE_COLORS[state]

  async function transition(toState: DecisionState) {
    let rationale: string | undefined
    if (rationaleRequired(toState)) {
      const input = window.prompt(
        `Why are you transitioning this trend to '${STATE_LABELS[toState]}'?\n(Required, min 3 chars)`,
      )
      if (!input || input.trim().length < 3) {
        setError('Rationale required (min 3 chars).')
        return
      }
      rationale = input.trim()
    }

    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/culture/v2/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trendId, toState, rationale }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setState(toState)
      setOpen(false)
      onChanged?.(toState)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={STATE_DESCRIPTIONS[state]}
        style={{
          padding: '4px 10px',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 700,
          background: colors.bg,
          color: colors.fg,
          border: `1px solid ${colors.bg === '#FFFDF3' ? '#000' : colors.bg}`,
          borderRadius: 3,
          cursor: 'pointer',
        }}
      >
        {STATE_LABELS[state]} ▾
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#FFFDF3',
            border: '1px solid #000',
            borderRadius: 3,
            minWidth: 160,
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {next.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: '#666' }}>
              No valid transitions from {STATE_LABELS[state]}
            </div>
          )}
          {next.map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                transition(s)
              }}
              disabled={busy}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #EEE',
                cursor: busy ? 'wait' : 'pointer',
                fontSize: 12,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              → {STATE_LABELS[s]}
              <div style={{ fontSize: 10, color: '#666' }}>{STATE_DESCRIPTIONS[s]}</div>
            </button>
          ))}
          {error && (
            <div style={{ padding: 8, fontSize: 11, color: '#FF1300' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}
