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

  // Bug fix: this used to `await req.json()` and re-serialize the parsed
  // object with `JSON.stringify()` to verify against -- but svix's HMAC
  // signature is computed over the EXACT raw bytes Clerk sent, not a
  // semantically-equivalent re-encoding of them. JSON.stringify(JSON.parse(x))
  // usually happens to reproduce plain-ASCII input byte-for-byte, which is
  // almost certainly why this wasn't obviously broken -- but it's not
  // guaranteed (differing key order isn't a risk here since V8 preserves
  // insertion order, but escaping of Unicode names, U+2028/U+2029, or any
  // future change to Clerk's own serialization would silently start
  // failing every webhook's signature check). `req.text()` reads the
  // literal raw body once; verify against that directly, then JSON.parse
  // it for evt.data below only after the signature has already checked
  // out.
  const rawBody = await req.text()
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: any
  try {
    evt = wh.verify(rawBody, {
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
