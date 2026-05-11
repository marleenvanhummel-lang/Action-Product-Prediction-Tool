import { createClient } from '@supabase/supabase-js'

// See lib/supabase.ts — Culture Radar doesn't use Supabase, but the legacy
// API routes (audio-checker, copy-check, scanner, trend-predictor) import
// this module. Fall back to placeholders so module evaluation doesn't crash
// when the Supabase env vars are absent.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key'

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
