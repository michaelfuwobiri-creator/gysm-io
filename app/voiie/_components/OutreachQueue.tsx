"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/app/voiie/_components/api";

interface Item {
  id: string;
  name: string;
  status: string;
  callStatus: string | null;
  reach: { channel: string; contact: string | null; confidence: string; source: string; region: string | null; notes: string[]; whatsappLocked: string | null; smsDisabled: string; pageSearchUrl: string };
  quiet: string | null;
  message: string;
  link: string | null;
}
interface QueueData { items: Item[]; counts: Record<string, number>; killSwitch: boolean; batchCap: number; sentToday: number }

const GROUPS: Array<[string, string]> = [
  ["email", "Email (automated, needs your approval)"],
  ["whatsapp", "WhatsApp (owner opted in: one tap from your phone)"],
  ["call", "Call (20-second script)"],
  ["card", "Printed card / postal"],
  ["none", "No channel"],
];

const btn = { fontSize: 11.5, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "#08080a", color: "var(--text)" } as const;

export function OutreachQueue() {
  const [data, setData] = useState<QueueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [approved, setApproved] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiGet<QueueData>("/api/voiie/queue")); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, doneMsg?: string) {
    try {
      const r = await apiPost<any>("/api/voiie/queue", body);
      if (doneMsg) setNote(doneMsg);
      if (r?.results) setNote(r.results.map((x: any) => `${x.id.slice(0, 6)}: ${x.ok ? "sent" : x.error}`).join(" | "));
      if (r?.counts) setNote(`Reach recorded for ${r.total} leads: ${JSON.stringify(r.counts)}`);
      setSelected({}); setApproved(false);
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  const waLink = (i: Item) => {
    const d = (i.reach.contact ?? "").replace(/\D/g, "");
    const n = i.reach.region === "US" && d.length === 10 ? `1${d}` : d;
    return `https://wa.me/${n}?text=${encodeURIComponent(i.message)}`;
  };
  const chosen = Object.keys(selected).filter((k) => selected[k]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "var(--text)", overflowY: "auto", height: "100%" }}>
      <a href="/voiie" style={{ fontSize: 12, color: "var(--text-faint)" }}>&larr; Back to dashboard</a>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px" }}>Outreach queue</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
        Each lead gets the best lawful channel. Nothing sends until you tick the leads and approve the batch. Cold SMS and cold WhatsApp are never offered (consent rules; Meta opt-in policy). Not legal advice.
      </p>
      {data?.killSwitch && <div style={{ color: "#f87171", fontSize: 12 }}>Kill switch is ON: sends are blocked.</div>}
      {error && <div style={{ color: "#f87171", fontSize: 12, margin: "6px 0" }}>{error}</div>}
      {note && <div style={{ color: "var(--fuchsia)", fontSize: 12, margin: "6px 0" }}>{note}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
        <button style={btn} onClick={() => act({ action: "reach-all" })}>Run reach on all leads</button>
        {data && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{Object.entries(data.counts).map(([k, v]) => `${k}: ${v}`).join(" · ")} · emails today {data.sentToday}/{data.batchCap}</span>}
        <a href="/voiie/calls" style={{ fontSize: 12, color: "var(--fuchsia)" }}>Call list &rarr;</a>
      </div>
      {!data && !error && <div style={{ fontSize: 12 }}>Loading...</div>}
      {data && GROUPS.map(([ch, title]) => {
        const items = data.items.filter((i) => i.reach.channel === ch);
        if (!items.length) return null;
        return (
          <div key={ch} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: "8px 0" }}>{title} ({items.length})</h2>
            {ch === "email" && (
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                <label><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> I approve sending the selected emails ({chosen.length} selected, cap {data.batchCap}/day)</label>{" "}
                <button style={btn} disabled={!approved || chosen.length === 0} onClick={() => act({ action: "send-batch", ids: chosen, confirm: true })}>Send approved batch</button>
              </div>
            )}
            {items.map((i) => (
              <div key={i.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 8, background: "var(--panel-1)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    {ch === "email" && <input type="checkbox" checked={!!selected[i.id]} onChange={(e) => setSelected({ ...selected, [i.id]: e.target.checked })} style={{ marginRight: 6 }} />}
                    <b style={{ fontSize: 13 }}>{i.name}</b> <span style={{ fontSize: 11, color: "var(--text-faint)" }}>({i.status}{i.callStatus ? `, call: ${i.callStatus}` : ""})</span>
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{i.reach.contact} · {i.reach.confidence} confidence · {i.reach.source}{i.reach.region ? ` · ${i.reach.region}` : ""}</div>
                  </div>
                </div>
                {i.quiet && <div style={{ fontSize: 11.5, color: "#fbbf24" }}>{i.quiet}</div>}
                {i.reach.notes.map((n) => <div key={n} style={{ fontSize: 11.5, color: "#fbbf24" }}>{n}</div>)}
                <textarea readOnly value={i.message} rows={3} style={{ width: "100%", marginTop: 6, background: "#08080a", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 11.5, padding: 6 }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <button style={btn} onClick={() => navigator.clipboard?.writeText(i.message)}>Copy message</button>
                  {ch === "whatsapp" && <a style={btn} href={waLink(i)} target="_blank" rel="noreferrer">Open WhatsApp</a>}
                  {ch === "call" && i.reach.contact && <a style={btn} href={`tel:${i.reach.contact.replace(/[^0-9+]/g, "")}`}>Call</a>}
                  {ch === "card" && <a style={btn} href={`/voiie/card/${i.id}`} target="_blank" rel="noreferrer">Open printable card</a>}
                  <a style={btn} href={i.reach.pageSearchUrl} target="_blank" rel="noreferrer">Find their Facebook/Instagram</a>
                  <button style={btn} onClick={() => act({ action: "mark", id: i.id, as: "sent", channel: ch })}>Mark sent</button>
                  <button style={btn} onClick={() => act({ action: "mark", id: i.id, as: "replied" })}>Mark replied</button>
                  <button style={{ ...btn, color: "#f87171" }} onClick={() => act({ action: "dnc", id: i.id })}>Do-not-contact</button>
                </div>
                {i.reach.whatsappLocked && <div style={{ fontSize: 11, color: "var(--text-ghost)", marginTop: 4 }}>WhatsApp: {i.reach.whatsappLocked}</div>}
                <div style={{ fontSize: 11, color: "var(--text-ghost)" }}>SMS: {i.reach.smsDisabled}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
