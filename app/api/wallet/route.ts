import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { toChecksum } from "@/lib/wallet";

// List the signed-in user's linked wallets (public addresses only).
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  try {
    const rows = await sql`
      select id, address, linked_at
      from user_wallets
      where user_id = ${user.id}
      order by linked_at asc
    `;
    return NextResponse.json({
      wallets: rows.map((r: any) => ({ id: r.id, address: toChecksum(r.address), linkedAt: r.linked_at })),
    });
  } catch (error: any) {
    console.error("[wallet] failed to list:", error.message);
    return NextResponse.json({ error: "Failed to load wallets." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
