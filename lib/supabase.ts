import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://lhtagndikscbmzwjwfae.supabase.co"
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy"
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || anon
const validUrl = url.startsWith('http') ? url : "https://lhtagndikscbmzwjwfae.supabase.co"
export const supabase = createClient(validUrl, anon)
export const supabaseAdmin = createClient(validUrl, service, { auth: { autoRefreshToken: false, persistSession: false } })
