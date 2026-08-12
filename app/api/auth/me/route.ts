import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
export async function GET(){
  const cookieStore = await cookies()
  const supabaseServer = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll(){ return cookieStore.getAll() } } } as any)
  const { data } = await supabaseServer.auth.getUser()
  return Response.json({ user: data.user })
}
