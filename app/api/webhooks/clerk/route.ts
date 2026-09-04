import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { sql } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email/send'

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!
  const h = headers()
  const svix_id = h.get("svix-id")!
  const svix_timestamp = h.get("svix-timestamp")!
  const svix_signature = h.get("svix-signature")!

  const payload = await req.json()
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: any
  try {
    evt = wh.verify(JSON.stringify(payload), {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    })
  } catch { return new Response('Invalid', { status: 400 }) }

  const { id, email_addresses, first_name, last_name, image_url } = evt.data
  const email = email_addresses?.[0]?.email_address || ''
  const name = `${first_name || ''} ${last_name || ''}`.trim() || email

  if (evt.type === 'user.created') {
    await sql`INSERT INTO users (clerk_id, email, name, image_url) VALUES (${id}, ${email}, ${name}, ${image_url}) ON CONFLICT (clerk_id) DO UPDATE SET email=${email}, name=${name}, image_url=${image_url}, updated_at=NOW()`
    // Fire-and-forget: sendWelcomeEmail already swallows/logs its own
    // errors (see lib/email/send.tsx), so a Resend hiccup can't turn into
    // a failed webhook that Clerk then retries forever.
    if (email) await sendWelcomeEmail(email, first_name || null)
  }
  if (evt.type === 'user.updated') {
    await sql`UPDATE users SET email=${email}, name=${name}, image_url=${image_url}, updated_at=NOW() WHERE clerk_id=${id}`
  }
  if (evt.type === 'user.deleted') {
    await sql`DELETE FROM users WHERE clerk_id=${id}`
  }

  return new Response('OK', { status: 200 })
}
export const dynamic = 'force-dynamic'
