import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";

// Admin-only delete -- for removing a mistaken or stale roadmap item.
// Votes cascade automatically (roadmap_votes.item_id references
// roadmap_items(id) on delete cascade, see db/migrations/0010).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    await sql`delete from roadmap_items where id = ${params.id}`;
    await logAudit({ actorUserId: user.id, action: "roadmap.delete", targetType: "roadmap_item", targetId: params.id });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[roadmap] failed to delete item:", error.message);
    return NextResponse.json({ error: "Failed to delete item." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
