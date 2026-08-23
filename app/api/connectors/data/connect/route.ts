import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { fetchAirtableSnapshot, fetchSheetsSnapshot } from "@/lib/dataConnectors";

// Connects Airtable or Google Sheets as a snapshot data source for one
// project -- see lib/dataConnectors.ts for why this is a snapshot import
// rather than a live sync.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "", provider = "";
  let token = "", baseId = "", table = "", csvUrl = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
    provider = (body?.provider ?? "").toString();
    token = (body?.token ?? "").toString().trim();
    baseId = (body?.baseId ?? "").toString().trim();
    table = (body?.table ?? "").toString().trim();
    csvUrl = (body?.csvUrl ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId || !["airtable", "google_sheets"].includes(provider)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ownerRows = await sql`
    select id from projects where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId})) limit 1
  `;
  if (!ownerRows[0]) return Response.json({ error: "Build not found." }, { status: 404 });

  let result;
  let config: Record<string, any> = {};
  let secretEncrypted: string | null = null;

  if (provider === "airtable") {
    if (!token || !baseId || !table) {
      return Response.json({ error: "Token, base ID, and table name are all required." }, { status: 400 });
    }
    result = await fetchAirtableSnapshot(token, baseId, table);
    config = { baseId, table };
    secretEncrypted = encryptSecret(token);
  } else {
    if (!csvUrl) return Response.json({ error: "A published CSV link is required." }, { status: 400 });
    result = await fetchSheetsSnapshot(csvUrl);
    config = { csvUrl };
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  config.columns = result.snapshot.columns;
  config.rows = result.snapshot.rows;

  await sql`
    insert into project_connectors (project_id, user_id, provider, config, secret_encrypted, status, last_synced_at)
    values (${projectId}, ${user.id}, ${provider}, ${JSON.stringify(config)}, ${secretEncrypted}, 'active', now())
    on conflict (project_id, provider) do update set
      config = excluded.config, secret_encrypted = excluded.secret_encrypted,
      status = 'active', error_message = null, last_synced_at = now(), updated_at = now()
  `;

  return Response.json({ ok: true, rowCount: result.snapshot.rows.length, columns: result.snapshot.columns, rows: result.snapshot.rows });
}
