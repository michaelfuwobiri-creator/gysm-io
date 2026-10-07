import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";

// Unlink a wallet. Scoped to the signed-in user in the WHERE clause itself.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid wallet id." }, { status: 400 });
  }

  try {
    const rows = await sql`
      delete from user_wallets
      where id = ${id} and user_id = ${user.id}
      returning id, address
    `;
    if (rows.length === 0) return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
    await logAudit({
      actorUserId: user.id,
      action: "wallet.unlink",
      targetType: "wallet",
      targetId: id,
      metadata: { address: (rows[0] as any).address },
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[wallet] failed to unlink:", error.message);
    return NextResponse.json({ error: "Could not unlink wallet." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
