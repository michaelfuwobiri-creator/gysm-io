import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOwnedAgent, nonNegInt, normalizePermissions } from "@/lib/shield";

const STATUSES = ["active", "paused", "quarantined"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  try {
    const a = await getOwnedAgent(params.id, user.id);
    if (!a) return Response.json({ error: "Agent not found." }, { status: 404 });

    const status = body?.status === undefined ? a.status : STATUSES.includes(body.status) ? body.status : null;
    if (!status) return Response.json({ error: "Invalid status." }, { status: 400 });
    const permissions = body?.permissions === undefined ? a.permissions : normalizePermissions(body.permissions);
    if (!permissions) return Response.json({ error: "Permissions must be scopes like crm:read or crm:*." }, { status: 400 });
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 80) : a.name;
    const description = typeof body?.description === "string" ? body.description.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300) : a.description;
    const rate = body?.rate_limit_per_min === undefined ? a.rate_limit_per_min : nonNegInt(body.rate_limit_per_min, a.rate_limit_per_min, 100000);
    const bulk = body?.bulk_limit === undefined ? a.bulk_limit : nonNegInt(body.bulk_limit, a.bulk_limit);
    const pay = body?.payment_limit_cents === undefined ? a.payment_limit_cents : nonNegInt(body.payment_limit_cents, a.payment_limit_cents);
    const auto = typeof body?.auto_quarantine === "boolean" ? body.auto_quarantine : a.auto_quarantine;

    await sql`
      update shield_agents set status = ${status}, permissions = ${permissions}, name = ${name}, description = ${description},
        rate_limit_per_min = ${rate}, bulk_limit = ${bulk}, payment_limit_cents = ${pay}, auto_quarantine = ${auto}
      where id = ${a.id} and user_id = ${user.id}
    `;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[shield] update agent failed:", error.message);
    return Response.json({ error: "Failed to update the agent." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const a = await getOwnedAgent(params.id, user.id);
    if (!a) return Response.json({ error: "Agent not found." }, { status: 404 });
    await sql`delete from shield_agents where id = ${a.id} and user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[shield] delete agent failed:", error.message);
    return Response.json({ error: "Failed to delete the agent." }, { status: 500 });
  }
}
