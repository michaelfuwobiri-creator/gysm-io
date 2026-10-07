import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { MAX_WALLETS_PER_USER, toChecksum, verifyWalletSignature } from "@/lib/wallet";

// Step 2 of linking: the wallet has signed the server's message. We consume
// the one-time challenge (atomically, so a replay finds nothing), check the
// signature, and only then store the public address.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!/^[0-9a-f]{32}$/.test(nonce) || !signature) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    // Consume: only this user's, unexpired, unused challenge. One shot.
    const consumed = await sql`
      update wallet_nonces
      set used_at = now()
      where nonce = ${nonce}
        and user_id = ${user.id}
        and used_at is null
        and expires_at > now()
      returning address, message
    `;
    if (consumed.length === 0) {
      return NextResponse.json({ error: "This request expired. Please try again." }, { status: 400 });
    }
    const { address, message } = consumed[0] as { address: string; message: string };

    const ok = await verifyWalletSignature(address, message, signature);
    if (!ok) {
      return NextResponse.json({ error: "Signature did not match that wallet." }, { status: 400 });
    }

    const count = await sql`select count(*)::int as n from user_wallets where user_id = ${user.id}`;
    const already = await sql`select id from user_wallets where user_id = ${user.id} and address = ${address}`;
    if (already.length > 0) {
      return NextResponse.json({ id: (already[0] as any).id, address: toChecksum(address), alreadyLinked: true });
    }
    if ((count[0] as any).n >= MAX_WALLETS_PER_USER) {
      return NextResponse.json(
        { error: `You can link up to ${MAX_WALLETS_PER_USER} wallets. Unlink one first.` },
        { status: 400 }
      );
    }

    const inserted = await sql`
      insert into user_wallets (user_id, address)
      values (${user.id}, ${address})
      on conflict (address) do nothing
      returning id, linked_at
    `;
    if (inserted.length === 0) {
      return NextResponse.json({ error: "That wallet is already linked to another GYSM account." }, { status: 409 });
    }
    const row = inserted[0] as any;
    await logAudit({
      actorUserId: user.id,
      action: "wallet.link",
      targetType: "wallet",
      targetId: row.id,
      metadata: { address },
    });
    return NextResponse.json({ id: row.id, address: toChecksum(address), linkedAt: row.linked_at });
  } catch (error: any) {
    console.error("[wallet/verify] failed:", error.message);
    return NextResponse.json({ error: "Could not link wallet." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
