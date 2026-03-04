import type { ScanSession } from '@/types/scanner'

// In-memory session store — suitable for single-user internal tool.
// Replace with Redis for multi-user / multi-process deployment.
//
// IMPORTANT: Must use globalThis to survive Next.js App Router module isolation.
// Each route file gets its own module bundle, so a plain `const sessions = new Map()`
// would create separate Map instances per route — sessions written by /api/scan
// would be invisible to /api/scan/[sessionId]/batch. globalThis is shared across all.
declare global {
  // eslint-disable-next-line no-var
  var __scanSessions: Map<string, ScanSession> | undefined
}
const sessions: Map<string, ScanSession> =
  globalThis.__scanSessions ?? (globalThis.__scanSessions = new Map())

export const sessionStore = {
  get(id: string): ScanSession | undefined {
    return sessions.get(id)
  },

  set(session: ScanSession): void {
    sessions.set(session.id, session)
  },

  update(id: string, patch: Partial<ScanSession>): void {
    const existing = sessions.get(id)
    if (existing) {
      sessions.set(id, { ...existing, ...patch })
    }
  },

  delete(id: string): void {
    sessions.delete(id)
  },

  has(id: string): boolean {
    return sessions.has(id)
  },
}
