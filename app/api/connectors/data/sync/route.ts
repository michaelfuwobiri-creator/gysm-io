import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { fetchAirtableSnapshot, fetchSheetsSnapshot } from "@/lib/dataConnectors";

// Re-fetches the latest snapshot for an already-connected Airtable/Sheets
// data source -- "Re-sync" in the UI. Same snapshot-not-live-sync model
// as connect; see lib/dataConnectors.ts.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  const rows = await sql`
    select provider, config, secret_encrypted from project_connectors
    where project_id = ${projectId} and user_id = ${user.id} and provider in ('airtable', 'google_sheets')
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) return Response.json({ error: "No data connector for this build yet." }, { status: 400 });

  let result;
  if (row.provider === "airtable") {
    const token = decryptSecret(row.secret_encrypted);
    result = await fetchAirtableSnapshot(token, row.config.baseId, row.config.table);
  } else {
    result = await fetchSheetsSnapshot(row.config.csvUrl);
  }

  if (!result.ok) {
    await sql`update project_connectors set status = 'error', error_message = ${result.error}, updated_at = now() where project_id = ${projectId} and provider = ${row.provider}`;
    return Response.json({ error: result.error }, { status: 400 });
  }

  const newConfig = { ...row.config, columns: result.snapshot.columns, rows: result.snapshot.rows };
  await sql`
    update project_connectors
    set config = ${JSON.stringify(newConfig)}, status = 'active', error_message = null, last_synced_at = now(), updated_at = now()
    where project_id = ${projectId} and provider = ${row.provider}
  `;

  return Response.json({ ok: true, rowCount: result.snapshot.rows.length, columns: result.snapshot.columns, rows: result.snapshot.rows });
}
