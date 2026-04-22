import { createClient } from '@supabase/supabase-js'

const clean = (v: string | undefined) => (v ?? '').replace(/[\s\u0000-\u001F\u007F]/g, '')

export const supabase = createClient(
  clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
)
