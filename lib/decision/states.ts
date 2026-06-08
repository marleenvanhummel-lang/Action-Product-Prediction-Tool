/**
 * Decision state machine for Culture Radar vNext.
 *
 * Allowed transitions are enforced at the API layer. The UI uses
 * `allowedNextStates()` to render only valid options in the menu.
 *
 * See `docs/culture-radar-vnext-prd.md` Pillar 3 / 4.
 */

import type { DecisionState } from '@/types/decision'

/**
 * Allowed transitions FROM → TO.
 * A trend in `monitor` can go to `validate` or be archived.
 * From `archive` we allow un-archive (→ monitor) only.
 */
const TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  monitor:  ['validate', 'archive'],
  validate: ['monitor', 'test', 'archive'],
  test:     ['monitor', 'activate', 'archive'],
  activate: ['measure', 'archive'],
  measure:  ['monitor', 'archive'],
  archive:  ['monitor'],
}

/**
 * States that require a rationale string when transitioning into them.
 * Rationale is editorial accountability — when a trend goes to activate
 * or archive, we want to know why.
 */
const RATIONALE_REQUIRED: DecisionState[] = ['activate', 'archive']

export function canTransition(from: DecisionState, to: DecisionState): boolean {
  if (from === to) return false
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function allowedNextStates(from: DecisionState): DecisionState[] {
  return TRANSITIONS[from] ?? []
}

export function rationaleRequired(to: DecisionState): boolean {
  return RATIONALE_REQUIRED.includes(to)
}

/**
 * Human-readable label for each state. Used in pills, menus, history.
 */
export const STATE_LABELS: Record<DecisionState, string> = {
  monitor:  'Monitor',
  validate: 'Validate',
  test:     'Test',
  activate: 'Activate',
  measure:  'Measure',
  archive:  'Archive',
}

/**
 * Short helper text for each state, shown in tooltips.
 */
export const STATE_DESCRIPTIONS: Record<DecisionState, string> = {
  monitor:  'Watching this signal, no action yet',
  validate: 'In review queue — confirm authenticity + fit',
  test:     'Running a small pilot or test content',
  activate: 'Live campaign / product / promo on this trend',
  measure:  'Activation done, measuring outcomes',
  archive:  'No further action; signal closed',
}

/**
 * Brand-aligned colour per state for UI use.
 * Uses the JackandAI palette: red (#FF1300), black (#000000), cream (#FFFDF3).
 */
export const STATE_COLORS: Record<DecisionState, { fg: string; bg: string }> = {
  monitor:  { fg: '#000000', bg: '#FFFDF3' },
  validate: { fg: '#FFFDF3', bg: '#000000' },
  test:     { fg: '#FFFDF3', bg: '#FF1300' },
  activate: { fg: '#FFFDF3', bg: '#000000' },
  measure:  { fg: '#000000', bg: '#FFE4E0' },
  archive:  { fg: '#666666', bg: '#EEEAE0' },
}
