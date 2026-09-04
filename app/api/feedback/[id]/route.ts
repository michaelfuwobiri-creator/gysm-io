import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";

// Triage endpoint -- admin-only, same guard as /api/roadmap/[id]. Unlike
// roadmap items (which only an admin can create in the first place), a
// feedback item is user-authored, so there's no "delete your own" case to
// carve out here yet: the only actor that needs to remove or re-status one
// today is Mike (spam, dupes, marking something planned/shipped/declined).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const status = ["open", "planned", "in_progress", "shipped", "declined"].includes(body?.status)
      ? body.status
      : null;
    if (!status) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    await sql`update feedback_items set status = ${status} where id = ${params.id}`;
    await logAudit({ actorUserId: user.id, action: "feedback.status_change", targetType: "feedback_item", targetId: params.id, metadata: { status } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[feedback] failed to update item:", error.message);
    return NextResponse.json({ error: "Failed to update item." }, { status: 500 });
  }
}

// Votes cascade automatically (feedback_votes.item_id references
// feedback_items(id) on delete cascade, see db/migrations/0023).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    await sql`delete from feedback_items where id = ${params.id}`;
    await logAudit({ actorUserId: user.id, action: "feedback.delete", targetType: "feedback_item", targetId: params.id });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[feedback] failed to delete item:", error.message);
    return NextResponse.json({ error: "Failed to delete item." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
