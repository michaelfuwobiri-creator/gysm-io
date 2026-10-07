import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  NONCE_TTL_MINUTES,
  buildLinkMessage,
  newNonce,
  normalizeAddress,
  resolveDomain,
} from "@/lib/wallet";

// Step 1 of linking: the server builds the exact message the wallet must
// sign. The client never composes it, so it cannot be tricked into signing
// something else, and the nonce is bound to this user + this address.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const domain = resolveDomain(req.headers.get("host"));
  if (!domain) return NextResponse.json({ error: "Unsupported domain." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const address = normalizeAddress(body?.address);
  if (!address) return NextResponse.json({ error: "That is not a valid wallet address." }, { status: 400 });

  try {
    // Cheap abuse guard: at most 10 challenges per user per 10 minutes.
    const recent = await sql`
      select count(*)::int as n from wallet_nonces
      where user_id = ${user.id} and created_at > now() - interval '10 minutes'
    `;
    if ((recent[0] as any).n >= 10) {
      return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    }
    // Housekeeping: drop challenges older than a day.
    await sql`delete from wallet_nonces where created_at < now() - interval '1 day'`;

    const nonce = newNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MINUTES * 60_000);
    const message = buildLinkMessage({ domain, address, nonce, issuedAt, expiresAt });

    await sql`
      insert into wallet_nonces (nonce, user_id, address, message, expires_at)
      values (${nonce}, ${user.id}, ${address}, ${message}, ${expiresAt.toISOString()})
    `;
    return NextResponse.json({ nonce, message });
  } catch (error: any) {
    console.error("[wallet/nonce] failed:", error.message);
    return NextResponse.json({ error: "Could not start wallet linking." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
