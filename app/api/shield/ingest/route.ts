import { NextRequest } from "next/server";
import { findAgentByToken, parseAction, processEvent } from "@/lib/shield";

// Agents call this BEFORE doing something sensitive:
//   POST /api/shield/ingest   Authorization: Bearer shd_...
//   { "scope": "crm:read", "action": "export contacts", "records": 12000, "amount_cents": 0 }
// -> { allowed, reasons, alerts, agent_status }
// Add ?strict=1 to get HTTP 403 when denied (handy as a Zapier/Make/n8n halt step).
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return Response.json({ error: "Missing bearer token." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const action = parseAction(body);
  if (!action) {
    return Response.json({ error: 'Body needs a valid "scope" (e.g. "crm:read"); "records" and "amount_cents" must be non-negative numbers.' }, { status: 400 });
  }

  try {
    const agent = await findAgentByToken(token);
    if (!agent) return Response.json({ error: "Invalid token." }, { status: 401 });
    const result = await processEvent(agent, action);
    const strict = new URL(req.url).searchParams.get("strict") === "1";
    return Response.json(
      { allowed: result.allowed, reasons: result.reasons, alerts: result.alerts.map((a) => ({ severity: a.severity, kind: a.kind })), agent_status: result.agent_status },
      { status: !result.allowed && strict ? 403 : 200 }
    );
  } catch (error: any) {
    console.error("[shield] ingest failed:", error.message);
    // Fail CLOSED: if Shield can't evaluate, the agent must not assume it's allowed.
    return Response.json({ allowed: false, reasons: ["shield_unavailable"], error: "Shield is unavailable." }, { status: 503 });
  }
}
