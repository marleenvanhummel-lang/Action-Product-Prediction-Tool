import { createClient } from '@supabase/supabase-js'

// Supabase is used by the legacy tools (scanner, copy-checker, trend-predictor,
// promo-radar, audio-checker) for auth + data. Culture Radar does NOT use
// Supabase — it lives on Neon/Vercel Postgres and is protected by API_SECRET.
//
// When the Supabase env vars are missing (e.g. local dev of culture-radar only)
// we still want this module to import cleanly so the rest of the app loads.
// We fall back to a harmless placeholder URL; any actual call to supabase.*
// will fail gracefully (caught by AuthGuard / Sidebar) instead of crashing
// at module evaluation time.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(url, anonKey)

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
