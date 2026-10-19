import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when the two Vercel environment variables are set. */
export const isConfigured = Boolean(url && key)

// Uses the public anon/publishable key only. Row-level security in the
// database is what keeps your data private, not this key.
export const supabase = createClient(url ?? 'https://not-configured.supabase.co', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
})
