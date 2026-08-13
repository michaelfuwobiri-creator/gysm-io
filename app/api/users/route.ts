import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

export async function GET() {
  const sql = neon(process.env.DATABASE_URL!)
  const users = await sql`
    SELECT name, email, LEFT(clerk_id,8) || '...' as clerk_id, created_at 
    FROM users ORDER BY created_at DESC LIMIT 5
  `
  return NextResponse.json(users)
}
export const dynamic = 'force-dynamic'