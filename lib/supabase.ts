import { createClient } from '@supabase/supabase-js'

// Fail fast and loud if these are missing. The old version of this file silently
// fell back to 'https://placeholder.supabase.co', which meant a missing env var
// in Vercel would surface as a confusing network error deep inside some unrelated
// request instead of a clear message at the point of misconfiguration.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Vercel -> Project -> Settings -> Environment Variables.`
    )
  }
  return value
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

/** Anon-key client. Safe to use on the client or server for RLS-scoped reads. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Service-role client. SERVER-SIDE ONLY -- bypasses Row Level Security.
 * Use for credits/subscriptions/webhook writes where we've already verified
 * the caller's identity ourselves. Never import this into a "use client" file.
 */
export const supabaseAdmin = createClient(
  supabaseUrl,
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } }
)
