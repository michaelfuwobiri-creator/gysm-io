"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/app/voiie/_components/api";

interface CallLead {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  region: string | null;
  signal: string | null;
  status: string;
  callStatus: string | null;
  link: string | null;
}

const OUTCOMES: Array<[string, string]> = [
  ["interested", "Interested"],
  ["called", "Spoke, not now"],
  ["no-answer", "No answer"],
  ["not-interested", "Not interested"],
  ["wrong-number", "Wrong number"],
];

const SCRIPT = `Hi, is this the owner of {name}? My name is Mike, I'm a local web designer. I noticed {name} doesn't have a website listed on Google, so I built a free sample homepage for you. Can I send you the link so you can look at it? There's no cost and no obligation to look. (If yes: read out or text the link below. If no: thank them and mark Not interested.)`;

export function CallList() {
  const [leads, setLeads] = useState<CallLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ leads: CallLead[] }>("/api/voiie/call-list");
      setLeads(d.leads);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function log(id: string, outcome: string) {
    setBusy(id);
    try {
      await apiPost("/api/voiie/call-list", { id, outcome });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const digits = (p: string) => p.replace(/[^0-9+]/g, "");
  // wa.me needs the full international number with no + or spaces.
  const waNumber = (l: CallLead) => {
    const d = l.phone.replace(/\D/g, "");
    return l.region === "US" && d.length === 10 ? `1${d}` : d;
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 24, color: "var(--text)", overflowY: "auto", height: "100%" }}>
      <a href="/voiie" style={{ fontSize: 12, color: "var(--text-faint)" }}>&larr; Back to dashboard</a>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "10px 0 4px" }}>Call list</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
        Businesses with a phone number and no email. Nothing is sent from here: you call by hand, call business hours only (about 9am to 5pm their time), never use an auto-dialer or recording, and stop if they say no.
        If the owner says yes, give them the link below yourself. Not legal advice.
      </p>
      <div style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 12, margin: "12px 0" }}>
        <b>Script:</b> {SCRIPT}
      </div>
      {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {leads === null && !error && <div style={{ fontSize: 12 }}>Loading...</div>}
      {leads?.length === 0 && <div style={{ fontSize: 12 }}>No phone-only leads right now. Run Hunt Now first.</div>}
      {leads?.map((l) => (
        <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginBottom: 10, background: "var(--panel-1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{l.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{l.address ?? ""}{l.region ? ` (${l.region})` : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <a href={`tel:${digits(l.phone)}`} style={{ fontWeight: 700, fontSize: 14 }}>{l.phone}</a>
              {l.callStatus && <div style={{ fontSize: 11, color: "var(--fuchsia)" }}>Last call: {l.callStatus}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {OUTCOMES.map(([k, label]) => (
              <button
                key={k}
                disabled={busy === l.id}
                onClick={() => log(l.id, k)}
                style={{ fontSize: 11.5, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border)", background: l.callStatus === k ? "var(--fuchsia)" : "#08080a", color: "var(--text)" }}
              >
                {label}
              </button>
            ))}
          </div>
          {l.link && (
            <div style={{ marginTop: 10, fontSize: 11.5 }}>
              <div style={{ color: "var(--text-faint)" }}>They said yes. Give them this link (read out, or text it from your own phone):</div>
              <input readOnly value={l.link} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", marginTop: 4, padding: 6, background: "#08080a", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 11 }} />
              <a href={`sms:${digits(l.phone)}?&body=${encodeURIComponent(`Hi, it's Mike following our call. Here's your free website sample for ${l.name}: ${l.link}`)}`} style={{ display: "inline-block", marginTop: 6, color: "var(--fuchsia)" }}>
                Open text message on this device
              </a>
              <a
                href={`https://wa.me/${waNumber(l)}?text=${encodeURIComponent(`Hi, it's Mike following our call. Here's your free website sample for ${l.name}: ${l.link}`)}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-block", marginTop: 6, marginLeft: 12, color: "var(--fuchsia)" }}
              >
                Send on WhatsApp (from your own WhatsApp)
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
