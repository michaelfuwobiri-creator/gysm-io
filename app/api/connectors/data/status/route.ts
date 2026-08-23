import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  const rows = await sql`
    select provider, config, status, error_message, last_synced_at
    from project_connectors
    where project_id = ${projectId} and user_id = ${user.id} and provider in ('airtable', 'google_sheets')
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) return Response.json({ connected: false });

  const rowCount = Array.isArray(row.config?.rows) ? row.config.rows.length : 0;
  return Response.json({
    connected: true,
    provider: row.provider,
    rowCount,
    columns: row.config?.columns ?? [],
    status: row.status,
    error_message: row.error_message,
    last_synced_at: row.last_synced_at,
  });
}
