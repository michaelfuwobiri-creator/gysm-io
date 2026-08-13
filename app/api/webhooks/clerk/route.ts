import { NextRequest, NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export async function POST(req: NextRequest) {
  const payload = await req.json()
  const { type, data } = payload

  if (type === 'user.created' || type === 'user.updated') {
    const sql = neon(process.env.DATABASE_URL!)
    const email = data.email_addresses?.[0]?.email_address || ''
    const name = `${data.first_name || ''} ${data.last_name || ''}`.trim() || email
    const avatar = data.image_url || ''

    await sql`
      INSERT INTO users (clerk_id, email, name, avatar_url)
      VALUES (${data.id}, ${email}, ${name}, ${avatar})
      ON CONFLICT (clerk_id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
    `
  }
  return NextResponse.json({ ok: true })
}
export const dynamic = 'force-dynamic'