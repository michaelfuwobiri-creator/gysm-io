import { createClient } from '@supabase/supabase-js'

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lhtagndikscbmzwjwfae.supabase.co"
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy"
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || anon
  // Ensure valid URL - never throw Invalid supabaseUrl during build
  const validUrl = url.startsWith('http') ? url : "https://lhtagndikscbmzwjwfae.supabase.co"
  return { url: validUrl, anon, service }
}

const { url, anon, service } = getSupabaseEnv()

export const supabase = createClient(url, anon)
export const supabaseAdmin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false }
})
