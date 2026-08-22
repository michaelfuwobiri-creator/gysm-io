import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// A small, fixed allowlist -- this only records interest in connectors
// GYSM.IO doesn't actually support yet (see app/connectors/page.tsx), so
// it deliberately can't be used to insert arbitrary rows for anything a
// client sends.
const REQUESTABLE_CONNECTORS = new Set([
  "stripe",
  "gmail",
  "slack",
  "google-sheets",
  "notion",
  "airtable",
]);

// Signed-in only: records that the current user wants a given connector
// built. No real integration is wired up by this -- see
// db/migrations/0009_connector_requests.sql.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let connector = "";
  try {
    const body = await req.json();
    connector = (body?.connector ?? "").toString().trim().toLowerCase();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!REQUESTABLE_CONNECTORS.has(connector)) {
    return Response.json({ error: "Unknown connector." }, { status: 400 });
  }

  try {
    await sql`
      insert into connector_requests (user_id, connector)
      values (${user.id}, ${connector})
      on conflict (user_id, connector) do nothing
    `;
    return Response.json({ ok: true, connector });
  } catch (error: any) {
    console.error("[connectors/request] failed to save:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// Returns the list of connector keys the current user has already
// requested, so /connectors can render "Requested" instead of the
// button again after a refresh.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select connector from connector_requests where user_id = ${user.id}
    `;
    return Response.json({ requested: rows.map((r: any) => r.connector) });
  } catch (error: any) {
    console.error("[connectors/request] failed to load:", error.message);
    return Response.json({ requested: [] });
  }
}
