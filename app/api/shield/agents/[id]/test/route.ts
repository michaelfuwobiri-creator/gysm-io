import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getOwnedAgent, processEvent, type AgentAction } from "@/lib/shield";

// "Send test event": runs a synthetic action through the SAME rules as real
// traffic so you can see exactly what Shield would do. Alerts are tagged (test).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let kind = "ok";
  try {
    kind = String((await req.json())?.kind ?? "ok");
  } catch {}
  try {
    const a = await getOwnedAgent(params.id, user.id);
    if (!a) return Response.json({ error: "Agent not found." }, { status: 404 });
    const granted = a.permissions.find((p) => !p.includes("*")) ?? "test:action";
    const action: AgentAction =
      kind === "scope" ? { scope: "shield-test:forbidden", action: "test: out-of-scope access" }
      : kind === "bulk" ? { scope: granted, action: "test: bulk export", records: a.bulk_limit + 1 }
      : kind === "payment" ? { scope: granted, action: "test: payment", amount_cents: a.payment_limit_cents + 100 }
      : { scope: granted, action: "test: normal action" };
    const result = await processEvent(a, action, { simulated: true });
    return Response.json(result);
  } catch (error: any) {
    console.error("[shield] test event failed:", error.message);
    return Response.json({ error: "Test failed." }, { status: 500 });
  }
}
