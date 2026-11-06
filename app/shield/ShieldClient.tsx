"use client";

import { useCallback, useEffect, useState } from "react";
import { PLATFORMS } from "@/lib/shieldCore";

type Agent = {
  id: string; name: string; platform: string; description: string; permissions: string[]; status: "active" | "paused" | "quarantined";
  token_prefix: string; rate_limit_per_min: number; bulk_limit: number; payment_limit_cents: number; auto_quarantine: boolean;
  risk: "low" | "medium" | "high" | "critical"; open_alerts: number; events_24h: number; denied_24h: number; last_seen_at: string | null;
};
type Alert = { id: string; agent_id: string; agent_name: string; severity: Agent["risk"]; kind: string; message: string; created_at: string; acknowledged_at: string | null };

const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] focus:outline-none focus:border-black/40";
const btn = "rounded-lg bg-black text-white text-[12px] font-semibold px-3 py-2 disabled:opacity-40";
const ghost = "text-[12px] text-black/50 hover:text-black px-1.5 disabled:opacity-30";
const RISK_CLS: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-700", medium: "bg-amber-500/10 text-amber-700", high: "bg-orange-500/10 text-orange-700", critical: "bg-red-500/10 text-red-700",
};
const STATUS_CLS: Record<string, string> = { active: "text-emerald-700", paused: "text-black/40", quarantined: "text-red-700" };

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ShieldClient() {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [notReady, setNotReady] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState({ agents: 0, active: 0, flagged: 0, open_alerts: 0 });
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "zapier", description: "", permissions: "", bulk: "1000", payment: "0" });
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [testMsg, setTestMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shield");
      const data = await res.json();
      if (!res.ok) return setErr(data.error || "Couldn't load.");
      if (data.ready === false) {
        setReady(false);
        setNotReady(data.message || "");
        return;
      }
      setAgents(data.agents);
      setAlerts(data.alerts);
      setSummary(data.summary);
      setErr("");
    } catch {
      setErr("Couldn't load. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function addAgent() {
    setErr("");
    const perms = form.permissions.split(/[\s,]+/).filter(Boolean);
    const res = await fetch("/api/shield/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, platform: form.platform, description: form.description, permissions: perms,
        bulk_limit: Number(form.bulk), payment_limit_cents: Math.round(Number(form.payment) * 100),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error || "Couldn't add the agent.");
    setToken({ name: data.agent.name, value: data.token });
    setForm({ name: "", platform: "zapier", description: "", permissions: "", bulk: "1000", payment: "0" });
    setAdding(false);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/shield/agents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "Couldn't update.");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this agent and its history? Its token will stop working.")) return;
    await fetch(`/api/shield/agents/${id}`, { method: "DELETE" });
    load();
  }

  async function ack(id: string) {
    await fetch(`/api/shield/alerts/${id}`, { method: "POST" });
    load();
  }

  async function test(id: string, kind: string) {
    setTestMsg("");
    const res = await fetch(`/api/shield/agents/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    const d = await res.json().catch(() => ({}));
    setTestMsg(res.ok ? `Test "${kind}": ${d.allowed ? "allowed" : "blocked"}${d.reasons?.length ? ` (${d.reasons.join(", ")})` : ""}. Agent is ${d.agent_status}.` : d.error || "Test failed.");
    load();
  }

  if (loading) return <p className="text-[13px] text-black/40">Loading…</p>;
  if (!ready) return <p className="text-[13px] text-black/60">{notReady || "Shield isn't enabled on this deployment yet."}</p>;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://gysm.io";

  return (
    <div className="space-y-8">
      {err && <p className="text-[13px] text-red-600">{err}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        {[["Agents", summary.agents], ["Active", summary.active], ["Flagged", summary.flagged], ["Open alerts", summary.open_alerts]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-black/10 p-3">
            <p className="text-2xl font-black">{v}</p>
            <p className="text-[11px] text-black/40">{k}</p>
          </div>
        ))}
      </div>

      {token && (
        <div className="rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-[12px] space-y-2">
          <p className="font-bold">Token for “{token.name}” — copy it now, it won't be shown again.</p>
          <code className="block break-all rounded bg-white border border-black/10 p-2 text-[12px] select-all">{token.value}</code>
          <p className="text-black/60">Have the agent call this before each sensitive action (add <code>?strict=1</code> to get HTTP 403 when blocked, which stops most Zapier/Make/n8n flows):</p>
          <pre className="whitespace-pre-wrap break-all rounded bg-white border border-black/10 p-2">{`curl -X POST ${origin}/api/shield/ingest \\
  -H "Authorization: Bearer ${token.value}" \\
  -H "Content-Type: application/json" \\
  -d '{"scope":"crm:read","action":"export contacts","records":250}'`}</pre>
          <button className={btn} onClick={() => setToken(null)}>I've saved it</button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Agents</h2>
          <button className={btn} onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "Add agent"}</button>
        </div>

        {adding && (
          <div className="rounded-xl border border-black/10 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="text-[11px] text-black/50">Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></div>
              <div>
                <label className="text-[11px] text-black/50">Platform</label>
                <select className={input} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div><label className="text-[11px] text-black/50">What it does</label><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} /></div>
            <div>
              <label className="text-[11px] text-black/50">Permissions it is allowed to use (comma or space separated, e.g. crm:read email:send, or crm:* for a whole area)</label>
              <input className={input} value={form.permissions} onChange={(e) => setForm({ ...form, permissions: e.target.value })} placeholder="crm:read email:send" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="text-[11px] text-black/50">Max records per action</label><input className={input} inputMode="numeric" value={form.bulk} onChange={(e) => setForm({ ...form, bulk: e.target.value })} /></div>
              <div><label className="text-[11px] text-black/50">Max payment per action (0 blocks all payments)</label><input className={input} inputMode="decimal" value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })} /></div>
            </div>
            <button className={btn} onClick={addAgent} disabled={!form.name.trim()}>Create agent &amp; get token</button>
          </div>
        )}

        {testMsg && <p className="text-[12px] text-black/60">{testMsg}</p>}

        {agents.length === 0 ? (
          <p className="text-[12px] text-black/40">No agents yet. Add one to get a token.</p>
        ) : (
          agents.map((a) => (
            <div key={a.id} className="rounded-xl border border-black/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-bold">{a.name}</p>
                <span className="text-[11px] text-black/40 uppercase">{a.platform}</span>
                <span className={`text-[11px] font-semibold capitalize ${STATUS_CLS[a.status]}`}>{a.status}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${RISK_CLS[a.risk]}`}>{a.risk} risk</span>
                <span className="ml-auto text-[11px] text-black/40">last seen {ago(a.last_seen_at)}</span>
              </div>
              {a.description && <p className="text-[12px] text-black/50 mt-1">{a.description}</p>}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {a.permissions.length === 0 ? <span className="text-[11px] text-black/40">No permissions granted — every action is blocked.</span> : a.permissions.map((p) => <span key={p} className="text-[11px] rounded bg-black/5 px-1.5 py-0.5">{p}</span>)}
              </div>
              <p className="text-[11px] text-black/40 mt-2">
                {a.events_24h} actions in 24h · {a.denied_24h} blocked · {a.open_alerts} open alert{a.open_alerts === 1 ? "" : "s"} · token {a.token_prefix}…
              </p>
              <div className="flex flex-wrap items-center gap-1 mt-2">
                {a.status !== "active" ? <button className={ghost} onClick={() => patch(a.id, { status: "active" })}>Resume</button> : <button className={ghost} onClick={() => patch(a.id, { status: "paused" })}>Pause</button>}
                {a.status !== "quarantined" && <button className={ghost} onClick={() => patch(a.id, { status: "quarantined" })}>Quarantine</button>}
                <span className="text-black/20">|</span>
                <span className="text-[11px] text-black/40">Test:</span>
                <button className={ghost} onClick={() => test(a.id, "ok")}>normal</button>
                <button className={ghost} onClick={() => test(a.id, "scope")}>out of scope</button>
                <button className={ghost} onClick={() => test(a.id, "bulk")}>bulk export</button>
                <button className={ghost} onClick={() => test(a.id, "payment")}>payment</button>
                <button className={ghost + " ml-auto"} onClick={() => remove(a.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[14px] font-bold">Alert feed</h2>
        {alerts.length === 0 ? (
          <p className="text-[12px] text-black/40">No alerts. When an agent breaks its rules it will show up here (and by email for high and critical alerts, if email is configured).</p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/10">
            {alerts.map((al) => (
              <li key={al.id} className={`p-3 flex items-start gap-3 ${al.acknowledged_at ? "opacity-50" : ""}`}>
                <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize mt-0.5 ${RISK_CLS[al.severity]}`}>{al.severity}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px]"><b>{al.agent_name}</b> · {al.kind.replace(/_/g, " ")}</p>
                  <p className="text-[12px] text-black/60 break-words">{al.message}</p>
                  <p className="text-[11px] text-black/30">{ago(al.created_at)}</p>
                </div>
                {!al.acknowledged_at && <button className={ghost} onClick={() => ack(al.id)}>Acknowledge</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-black/30">Text-message alerts are not available yet; email alerts need email sending to be configured on this deployment.</p>
      </section>
    </div>
  );
}
