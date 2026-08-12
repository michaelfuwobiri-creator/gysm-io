import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!supabaseUrl && typeof window !== 'undefined') {
  console.error("NEXT_PUBLIC_SUPABASE_URL is missing in Vercel env vars")
}

const url = supabaseUrl || "https://lhtagndikscbmzwjwfae.supabase.co"
const anon = supabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder"

export const supabase = createClient(url, anon)
export const supabaseAdmin = createClient(url, serviceKey || anon, {
  auth: { autoRefreshToken: false, persistSession: false }
})
