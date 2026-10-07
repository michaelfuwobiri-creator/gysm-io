import { getUser } from "@/lib/auth";
import { SHIELD_NOT_READY, listAgentViews, listAlerts, shieldReady } from "@/lib/shield";

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    if (!(await shieldReady())) return Response.json({ ready: false, message: SHIELD_NOT_READY });
    const [agents, alerts] = await Promise.all([listAgentViews(user.id), listAlerts(user.id)]);
    const safeAgents = agents.map(({ user_id, alert_email, ...rest }) => rest);
    return Response.json({
      ready: true,
      agents: safeAgents,
      alerts,
      summary: {
        agents: agents.length,
        active: agents.filter((a) => a.status === "active").length,
        flagged: agents.filter((a) => a.status === "quarantined" || a.risk === "high" || a.risk === "critical").length,
        open_alerts: agents.reduce((n, a) => n + a.open_alerts, 0),
      },
    });
  } catch (error: any) {
    console.error("[shield] load failed:", error.message);
    return Response.json({ error: "Failed to load Shield." }, { status: 500 });
  }
}
