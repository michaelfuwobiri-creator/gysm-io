import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 500 })
    }
    const sql = neon(process.env.DATABASE_URL)
    const users = await sql`SELECT name, email, LEFT(clerk_id,8) || '...' as clerk_id, created_at FROM users ORDER BY created_at DESC LIMIT 5`
    return NextResponse.json(users)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}