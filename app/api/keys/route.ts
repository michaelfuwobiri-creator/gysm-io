import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateApiKey } from "@/lib/apiKeys";
import { logAudit } from "@/lib/auditLog";

// List (masked -- key_prefix only, never the full key) and create API
// keys for the signed-in user. Owner-scoped throughout, same pattern as
// every other /api/projects/[id]/* route.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select id, name, key_prefix, created_at, last_used_at, revoked_at
      from api_keys
      where user_id = ${user.id}
      order by created_at desc
    `;
    return NextResponse.json({ keys: rows });
  } catch (error: any) {
    console.error("[keys] failed to list:", error.message);
    return NextResponse.json({ error: "Failed to load API keys." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").toString().trim().slice(0, 80) || "Untitled key";

    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    const rows = await sql`
      insert into api_keys (user_id, name, key_hash, key_prefix)
      values (${user.id}, ${name}, ${keyHash}, ${keyPrefix})
      returning id, name, key_prefix, created_at
    `;
    const row = rows[0] as any;
    // Logs the key's id/name/prefix only -- never the raw key itself,
    // which isn't stored anywhere after this response (see comment below).
    await logAudit({ actorUserId: user.id, action: "api_key.create", targetType: "api_key", targetId: row.id, metadata: { name: row.name, keyPrefix: row.key_prefix } });
    // The only time the raw key is ever returned -- it's not recoverable
    // after this response, only revocable.
    return NextResponse.json({ id: row.id, name: row.name, keyPrefix: row.key_prefix, createdAt: row.created_at, key: rawKey });
  } catch (error: any) {
    console.error("[keys] failed to create:", error.message);
    return NextResponse.json({ error: "Failed to create API key." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
