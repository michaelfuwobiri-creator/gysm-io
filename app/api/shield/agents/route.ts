import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  DEFAULT_BULK_LIMIT,
  DEFAULT_PAYMENT_LIMIT_CENTS,
  DEFAULT_RATE_LIMIT,
  PLATFORMS,
  SHIELD_NOT_READY,
  generateToken,
  nonNegInt,
  normalizePermissions,
  shieldReady,
} from "@/lib/shield";

const MAX_AGENTS = 50;

// Register an agent. The token is returned ONCE here and only its hash is stored.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 80) : "";
  if (!name) return Response.json({ error: "Give the agent a name." }, { status: 400 });
  const platform = (PLATFORMS as readonly string[]).includes(body?.platform) ? body.platform : "custom";
  const description = typeof body?.description === "string" ? body.description.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300) : "";
  const permissions = normalizePermissions(body?.permissions ?? []);
  if (!permissions) return Response.json({ error: "Permissions must be scopes like crm:read, email:send or crm:*." }, { status: 400 });

  try {
    if (!(await shieldReady())) return Response.json({ error: SHIELD_NOT_READY }, { status: 409 });
    const count = (await sql`select count(*)::int as n from shield_agents where user_id = ${user.id}`) as { n: number }[];
    if ((count[0]?.n ?? 0) >= MAX_AGENTS) return Response.json({ error: `You can monitor up to ${MAX_AGENTS} agents.` }, { status: 400 });

    const t = generateToken();
    const rows = await sql`
      insert into shield_agents (user_id, name, platform, description, permissions, token_hash, token_prefix,
                                 rate_limit_per_min, bulk_limit, payment_limit_cents, alert_email)
      values (${user.id}, ${name}, ${platform}, ${description}, ${permissions}, ${t.hash}, ${t.prefix},
              ${nonNegInt(body?.rate_limit_per_min, DEFAULT_RATE_LIMIT, 100000)}, ${nonNegInt(body?.bulk_limit, DEFAULT_BULK_LIMIT)},
              ${nonNegInt(body?.payment_limit_cents, DEFAULT_PAYMENT_LIMIT_CENTS)}, ${user.email ?? null})
      returning id, name, platform, token_prefix
    `;
    return Response.json({ agent: rows[0], token: t.raw });
  } catch (error: any) {
    console.error("[shield] create agent failed:", error.message);
    return Response.json({ error: "Failed to add the agent." }, { status: 500 });
  }
}
