// Database + side effects for Shield (agent monitor). Rules live in shieldCore.ts.
// Degrades to "not ready" if migration 0029 has not been applied.
import crypto from "crypto";
import { sql } from "@/lib/db";
import {
  RATE_WINDOW_MS,
  SERIOUS_WINDOW_MS,
  evaluate,
  isSerious,
  riskLevel,
  shouldQuarantine,
  type AgentAction,
  type AgentPolicy,
  type AgentStatus,
  type Decision,
  type RaisedAlert,
  type Severity,
} from "@/lib/shieldCore";

export * from "@/lib/shieldCore";

export const SHIELD_NOT_READY = "Shield isn't enabled on this deployment yet (database migration 0029 has not been applied).";
const TOKEN_PREFIX = "shd_";

export type Agent = AgentPolicy & {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  description: string;
  auto_quarantine: boolean;
  alert_email: string | null;
  token_prefix: string;
  created_at: string;
  last_seen_at: string | null;
};

export async function shieldReady(): Promise<boolean> {
  try {
    await sql`select 1 as x from shield_agents limit 1`;
    await sql`select 1 as x from shield_events limit 1`;
    await sql`select 1 as x from shield_alerts limit 1`;
    return true;
  } catch {
    return false;
  }
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, TOKEN_PREFIX.length + 6) };
}

function toAgent(r: any): Agent {
  return { ...r, payment_limit_cents: Number(r.payment_limit_cents), permissions: r.permissions ?? [] } as Agent;
}

export async function findAgentByToken(raw: string): Promise<Agent | null> {
  if (!raw.startsWith(TOKEN_PREFIX) || raw.length > 200) return null;
  const rows = await sql`select * from shield_agents where token_hash = ${hashToken(raw)} limit 1`;
  return rows[0] ? toAgent(rows[0]) : null;
}

export async function getOwnedAgent(id: string, userId: string): Promise<Agent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql`select * from shield_agents where id = ${id} and user_id = ${userId} limit 1`;
  return rows[0] ? toAgent(rows[0]) : null;
}

async function emailAlert(to: string | null, agentName: string, alerts: RaisedAlert[]) {
  if (!to || !process.env.RESEND_API_KEY || alerts.length === 0) return;
  try {
    const { getResend } = await import("@/lib/email/resend");
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const rows = alerts.map((a) => `<li><b>${esc(a.severity.toUpperCase())}</b> ${esc(a.kind)}: ${esc(a.message)}</li>`).join("");
    const resend = await getResend();
    await resend.emails.send({
      from: "GYSM Shield <hello@gysm.io>",
      to,
      subject: `Shield alert: ${agentName}`,
      html: `<p>Shield flagged agent <b>${esc(agentName)}</b>:</p><ul>${rows}</ul><p>Review it at <a href="https://gysm.io/shield">gysm.io/shield</a>.</p>`,
    });
  } catch (error: any) {
    console.error("[shield] alert email failed:", error.message);
  }
}

/**
 * Evaluate and record one action reported by an agent. Used by the ingest
 * endpoint and by the dashboard's "send test event" button (simulated=true
 * just tags the alert text).
 */
export async function processEvent(
  agent: Agent,
  action: AgentAction,
  opts: { simulated?: boolean } = {}
): Promise<Decision & { agent_status: AgentStatus }> {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = (await sql`
    select count(*)::int as n from shield_events where agent_id = ${agent.id} and at > ${since}
  `) as { n: number }[];
  const decision = evaluate(agent, action, recent[0]?.n ?? 0);

  await sql`
    insert into shield_events (agent_id, scope, action, records, amount_cents, decision)
    values (${agent.id}, ${action.scope}, ${action.action ?? null}, ${action.records ?? null}, ${action.amount_cents ?? null}, ${decision.allowed ? "allow" : "deny"})
  `;
  await sql`update shield_agents set last_seen_at = now() where id = ${agent.id}`;
  if (Math.random() < 0.02) {
    sql`delete from shield_events where agent_id = ${agent.id} and at < now() - interval '7 days'`.catch(() => {});
  }

  let status: AgentStatus = agent.status;
  const raised = decision.alerts.map((a) => (opts.simulated ? { ...a, message: `(test) ${a.message}` } : a));

  if (raised.length > 0) {
    for (const a of raised) {
      // One alert per (agent, kind) per minute: a runaway loop must not bury the feed.
      const dup = (await sql`
        select 1 as x from shield_alerts
        where agent_id = ${agent.id} and kind = ${a.kind} and acknowledged_at is null and created_at > now() - interval '1 minute' limit 1
      `) as unknown[];
      if (dup.length === 0) {
        await sql`
          insert into shield_alerts (user_id, agent_id, severity, kind, message)
          values (${agent.user_id}, ${agent.id}, ${a.severity}, ${a.kind}, ${a.message})
        `;
      }
    }

    if (agent.status === "active" && agent.auto_quarantine) {
      const cutoff = new Date(Date.now() - SERIOUS_WINDOW_MS).toISOString();
      const serious = (await sql`
        select count(*)::int as n from shield_alerts
        where agent_id = ${agent.id} and created_at > ${cutoff} and severity in ('high','critical')
      `) as { n: number }[];
      if (shouldQuarantine(raised, serious[0]?.n ?? 0)) {
        await sql`update shield_agents set status = 'quarantined' where id = ${agent.id} and status = 'active'`;
        status = "quarantined";
        raised.push({ severity: "high", kind: "auto_quarantine", message: "Agent was quarantined automatically." });
        await sql`
          insert into shield_alerts (user_id, agent_id, severity, kind, message)
          values (${agent.user_id}, ${agent.id}, 'high', 'auto_quarantine', 'Agent was quarantined automatically.')
        `;
      }
    }

    await emailAlert(agent.alert_email, agent.name, raised.filter((a) => isSerious(a.severity)));
  }

  return { ...decision, alerts: raised, agent_status: status };
}

export type AgentView = Agent & { risk: Severity; open_alerts: number; events_24h: number; denied_24h: number };

export async function listAgentViews(userId: string): Promise<AgentView[]> {
  const agents = ((await sql`select * from shield_agents where user_id = ${userId} order by created_at desc limit 200`) as any[]).map(toAgent);
  if (agents.length === 0) return [];
  const open = (await sql`
    select agent_id, severity from shield_alerts where user_id = ${userId} and acknowledged_at is null
  `) as { agent_id: string; severity: Severity }[];
  const ev = (await sql`
    select e.agent_id, count(*)::int as n, count(*) filter (where e.decision = 'deny')::int as denied
    from shield_events e join shield_agents a on a.id = e.agent_id
    where a.user_id = ${userId} and e.at > now() - interval '24 hours' group by e.agent_id
  `) as { agent_id: string; n: number; denied: number }[];
  return agents.map((a) => {
    const mine = open.filter((o) => o.agent_id === a.id);
    const e = ev.find((x) => x.agent_id === a.id);
    return { ...a, risk: riskLevel(mine), open_alerts: mine.length, events_24h: e?.n ?? 0, denied_24h: e?.denied ?? 0 };
  });
}

export async function listAlerts(userId: string, limit = 50) {
  return (await sql`
    select al.id, al.agent_id, a.name as agent_name, al.severity, al.kind, al.message, al.created_at, al.acknowledged_at
    from shield_alerts al join shield_agents a on a.id = al.agent_id
    where al.user_id = ${userId} order by al.created_at desc limit ${limit}
  `) as any[];
}
