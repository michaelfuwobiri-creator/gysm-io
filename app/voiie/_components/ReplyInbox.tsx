"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/app/voiie/_components/api";

interface Msg { at: string; dir: "inbound" | "outbound"; channel: string; body: string }
interface Thread {
  id: string; name: string; email: string | null; phone: string | null; status: string; doNotContact: boolean;
  lastInboundAt: string; unanswered: boolean; handled: boolean; lastChannel: string; canEmail: boolean;
  suggestions: Array<{ label: string; body: string }>; messages: Msg[];
}
interface InboxData { items: Thread[]; unanswered: number; killSwitch: boolean; replyDomainConfigured: boolean }

const btn = { fontSize: 11.5, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "#08080a", color: "var(--text)" } as const;

export function ReplyInbox() {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiGet<InboxData>("/api/voiie/inbox")); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(String(body.id));
    try { await apiPost("/api/voiie/inbox", body); setNote(done); setError(null); if (body.action === "reply") setDrafts((d) => ({ ...d, [String(body.id)]: "" })); await load(); }
    catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "var(--text)", overflowY: "auto", height: "100%" }}>
      <a href="/voiie" style={{ fontSize: 12, color: "var(--text-faint)" }}>&larr; Back to dashboard</a>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px" }}>Reply inbox {data ? `(${data.unanswered} waiting)` : ""}</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
        Everyone who wrote back. Pick a suggestion or type your own, then press Send. Nothing is sent without your click, and the automatic follow-ups stop the moment someone replies. Email replies only; WhatsApp replies show here but you answer them in WhatsApp.
      </p>
      {data && !data.replyDomainConfigured && (
        <div style={{ color: "#fbbf24", fontSize: 12, margin: "6px 0" }}>
          Email replies are not connected to this inbox yet: they still land in info@gysm.io. See the reply-inbox setup in docs/VOIIE-SETUP.md.
        </div>
      )}
      {data?.killSwitch && <div style={{ color: "#f87171", fontSize: 12 }}>Kill switch is ON: sends are blocked.</div>}
      {error && <div style={{ color: "#f87171", fontSize: 12, margin: "6px 0" }}>{error}</div>}
      {note && <div style={{ color: "var(--fuchsia)", fontSize: 12, margin: "6px 0" }}>{note}</div>}
      {data && data.items.length === 0 && <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 16 }}>No replies yet.</div>}
      {data?.items.map((t) => (
        <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, margin: "12px 0", opacity: t.handled ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {t.name} {t.unanswered && <span style={{ color: "#fbbf24", fontSize: 11 }}>● waiting for you</span>}
              {t.doNotContact && <span style={{ color: "#f87171", fontSize: 11 }}> · opted out</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{t.email ?? t.phone ?? ""} · {t.status} · {new Date(t.lastInboundAt).toLocaleString()}</div>
          </div>
          <div style={{ margin: "8px 0", display: "grid", gap: 6 }}>
            {t.messages.map((m, i) => (
              <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", padding: "6px 9px", borderRadius: 8, background: m.dir === "inbound" ? "#14141a" : "#0a0a0d", borderLeft: `3px solid ${m.dir === "inbound" ? "var(--fuchsia)" : "var(--border)"}` }}>
                <span style={{ fontSize: 10.5, color: "var(--text-ghost)" }}>{m.dir === "inbound" ? "They wrote" : "We sent"} · {m.channel} · {new Date(m.at).toLocaleString()}</span>
                {"\n"}{m.body}
              </div>
            ))}
          </div>
          {t.canEmail ? (
            <>
              {t.suggestions.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {t.suggestions.map((s) => <button key={s.label} style={btn} onClick={() => setDrafts((d) => ({ ...d, [t.id]: s.body }))}>Use: {s.label}</button>)}
                </div>
              )}
              <textarea
                value={drafts[t.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                placeholder="Type your reply (a footer with unsubscribe link is added)..."
                rows={4}
                style={{ width: "100%", fontSize: 12.5, padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "#08080a", color: "var(--text)" }}
              />
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{t.doNotContact ? "Opted out: no replies allowed." : "No email on file for this lead."}</div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            {t.canEmail && <button style={{ ...btn, borderColor: "var(--fuchsia)" }} disabled={busy === t.id || !(drafts[t.id] ?? "").trim() || data.killSwitch} onClick={() => act({ action: "reply", id: t.id, body: drafts[t.id] }, `Reply sent to ${t.name}.`)}>Send reply</button>}
            <button style={btn} disabled={busy === t.id} onClick={() => act({ action: "handled", id: t.id }, "Marked handled.")}>Mark handled</button>
            {!t.doNotContact && <button style={btn} disabled={busy === t.id} onClick={() => act({ action: "dnc", id: t.id }, "Marked do-not-contact.")}>Do-not-contact</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
