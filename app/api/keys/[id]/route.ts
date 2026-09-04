import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";

// Revokes a key (soft delete via revoked_at, not a hard DELETE) -- keeps
// the row around for the "last used" audit trail and so a reused/leaked
// key that gets hit after revocation shows up as a deliberate no-match in
// verifyApiKey rather than disappearing without a trace. Owner-scoped.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      update api_keys set revoked_at = now()
      where id = ${params.id} and user_id = ${user.id} and revoked_at is null
      returning id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Key not found." }, { status: 404 });
    }
    await logAudit({ actorUserId: user.id, action: "api_key.revoke", targetType: "api_key", targetId: params.id });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[keys] failed to revoke:", error.message);
    return NextResponse.json({ error: "Failed to revoke key." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
