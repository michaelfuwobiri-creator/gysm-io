import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";

// Public roadmap board -- generalizes the honest "real request, no fake
// button" pattern already used for /connectors (connector_requests) into
// a general feature board anyone can browse and vote on. Reading the
// list needs no auth (roadmap is public, like /pricing or /buildguild);
// creating an item is admin-only (see lib/isAdmin.ts) so the board can't
// be spammed -- voting (app/api/roadmap/[id]/vote) is the only
// user-facing write.
export async function GET() {
  try {
    const user = await getUser();
    const userId = user?.id ?? null;
    const rows = await sql`
      select
        r.id, r.title, r.description, r.status, r.created_at,
        count(v.user_id)::int as votes,
        coalesce(bool_or(v.user_id = ${userId}), false) as voted
      from roadmap_items r
      left join roadmap_votes v on v.item_id = r.id
      group by r.id
      order by votes desc, r.created_at desc
    `;
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    console.error("[roadmap] failed to list items:", error.message);
    return NextResponse.json({ error: "Failed to load roadmap." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const title = (body?.title ?? "").toString().trim().slice(0, 200);
    const description = (body?.description ?? "").toString().trim().slice(0, 2000) || null;
    const status = ["planned", "in_progress", "shipped"].includes(body?.status) ? body.status : "planned";

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const rows = await sql`
      insert into roadmap_items (title, description, status)
      values (${title}, ${description}, ${status})
      returning id
    `;
    const id = (rows[0] as any).id;
    await logAudit({ actorUserId: user.id, action: "roadmap.create", targetType: "roadmap_item", targetId: id, metadata: { title, status } });
    return NextResponse.json({ id });
  } catch (error: any) {
    console.error("[roadmap] failed to create item:", error.message);
    return NextResponse.json({ error: "Failed to create item." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
