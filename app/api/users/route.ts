import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const users = await sql`SELECT name, email, LEFT(clerk_id,8) || '...' as clerk_id, created_at FROM users ORDER BY created_at DESC LIMIT 5`
    return NextResponse.json(users)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
