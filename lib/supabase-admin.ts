import { createClient } from '@supabase/supabase-js'

const clean = (v: string | undefined) => (v ?? '').replace(/[\s\u0000-\u001F\u007F]/g, '')

export const supabaseAdmin = createClient(
  clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
