"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/voiie/_components/icons";
import { apiGet, apiPost } from "@/app/voiie/_components/api";
import { DEFAULT_HUNT_QUERY, DEFAULT_OUTREACH_TEMPLATE as DEFAULT_TEMPLATE } from "@/lib/voiie/constants";
import type { Toast } from "@/app/voiie/_components/useToasts";
import type { VoiieLead } from "@/app/voiie/_components/types";

export function HunterPanel({
  stats,
  onHunted,
  pushToast,
}: {
  stats: { leadsToday: number; contacted: number; consulting: number; paid: number };
  onHunted: () => void;
  pushToast: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [huntQuery, setHuntQuery] = useState(DEFAULT_HUNT_QUERY);
  const [platforms, setPlatforms] = useState({ Twitter: true, Threads: true });
  const [scanning, setScanning] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [channels, setChannels] = useState({ twitter: true, whatsapp: true, email: true });
  const [autoOutreach, setAutoOutreach] = useState(false);

  const huntNow = async () => {
    setScanning(true);
    try {
      const platformList = Object.entries(platforms)
        .filter(([, on]) => on)
        .map(([p]) => p.toLowerCase());
      const result = await apiPost<{ newLeadsCreated: number; scanned: number }>("/api/voiie/hunt", {
        query: huntQuery,
        platforms: platformList,
      });
      onHunted();
      pushToast(
        result.newLeadsCreated > 0
          ? `${result.newLeadsCreated} new lead(s) hunted`
          : `Scanned ${result.scanned} post(s) — no new leads this pass`,
        "fuchsia"
      );
    } catch (err) {
      pushToast((err as Error).message, "cyan");
    } finally {
      setScanning(false);
    }
  };

  // Client-side auto-outreach loop: while ON, DMs the next un-contacted
  // hunted lead every 5 minutes using the currently-selected channel. This
  // runs only while the dashboard tab is open -- for outreach that keeps
  // going with the tab closed, extend app/api/voiie/cron/hunt/route.ts (it
  // already sweeps on a schedule) to also send first-touch outreach.
  const autoRef = useRef(autoOutreach);
  autoRef.current = autoOutreach;

  useEffect(() => {
    if (!autoOutreach) return;
    const interval = setInterval(async () => {
      if (!autoRef.current) return;
      try {
        const data = await apiGet<{ leads: VoiieLead[] }>("/api/voiie/leads");
        const next = data.leads.find((l) => l.status === "new");
        if (!next) return;
        const channel = channels.whatsapp ? "whatsapp" : channels.twitter ? "twitter" : "email";
        await apiPost(`/api/voiie/outreach/${next.id}`, { channel, template });
        onHunted();
        pushToast(`Auto-outreach sent to ${next.handle}`, "fuchsia");
      } catch (err) {
        pushToast((err as Error).message, "cyan");
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoOutreach, channels, template, onHunted, pushToast]);

  const highlightTemplate = (str: string) => {
    const parts = str.split(/(\{[a-z]+\})/gi);
    return parts.map((p, i) => (/\{[a-z]+\}/i.test(p) ? <span key={i} style={{ color: "var(--fuchsia)" }}>{p}</span> : <span key={i}>{p}</span>));
  };

  const responseRate = stats.contacted ? Math.round(((stats.consulting + stats.paid) / stats.contacted) * 100) : 0;

  return (
    <div style={{ width: 300, flexShrink: 0, background: "var(--bg)", borderLeft: "1px solid var(--border)" }} className="flex flex-col h-full overflow-y-auto">
      <div style={{ padding: 16 }}>
        <div className="flex items-center gap-2">
          <Icon.bolt style={{ width: 14, height: 14, color: "var(--fuchsia)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>VOIIE Hunter Agent</span>
          <span className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--fuchsia)", marginLeft: "auto" }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--fuchsia)" }}>LIVE</span>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Search Query
          </div>
          <textarea
            value={huntQuery}
            onChange={(e) => setHuntQuery(e.target.value)}
            rows={3}
            className="font-mono"
            style={{ width: "100%", background: "#0a0a0d", border: "1px solid var(--border)", borderRadius: 10, padding: 9, fontSize: 10.5, color: "var(--text-dim)", resize: "none" }}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Platforms
          </div>
          <div className="flex flex-col gap-2">
            {[
              ["Twitter", "#1d9bf0"],
              ["Threads", "#8b5cf6"],
            ].map(([p, c]) => (
              <div key={p} className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 9999, background: c }} />
                  {p}
                </span>
                <div className={"toggle " + (platforms[p as "Twitter" | "Threads"] ? "on" : "")} onClick={() => setPlatforms((s) => ({ ...s, [p]: !s[p as "Twitter" | "Threads"] }))}>
                  <div className="knob" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={huntNow}
          disabled={scanning}
          className="grad-fv"
          style={{ marginTop: 16, width: "100%", height: 40, borderRadius: 9999, color: "#fff", fontWeight: 700, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
        >
          {scanning ? (
            <>
              <Icon.refresh className="animate-spin" style={{ width: 14, height: 14 }} /> Scanning Twitter/X/Threads...
            </>
          ) : (
            <>
              <Icon.bolt style={{ width: 14, height: 14 }} /> Hunt Now — Scan Twitter/X/Threads
            </>
          )}
        </button>

        <div style={{ marginTop: 16 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Outreach Template
          </div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={4}
            style={{ width: "100%", background: "#0a0a0d", border: "1px solid var(--border)", borderRadius: 10, padding: 9, fontSize: 11, color: "var(--text-dim)", resize: "none" }}
          />
          <div style={{ fontSize: 10, marginTop: 6, lineHeight: 1.6, color: "var(--text-faint)" }}>{highlightTemplate(template)}</div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Channels
          </div>
          <div className="flex flex-col gap-2">
            {[
              ["twitter", "Twitter DM"],
              ["whatsapp", "WhatsApp"],
              ["email", "Email"],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
                <div className={"toggle " + (channels[k as keyof typeof channels] ? "on" : "")} onClick={() => setChannels((s) => ({ ...s, [k]: !s[k as keyof typeof channels] }))}>
                  <div className="knob" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 14, background: "#0a0a0d", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Auto Outreach</div>
            <div style={{ fontSize: 9.5, color: "var(--text-ghost)" }}>DM new leads every 5 min</div>
          </div>
          <div className={"toggle " + (autoOutreach ? "on" : "")} onClick={() => setAutoOutreach((s) => !s)}>
            <div className="knob" />
          </div>
        </div>

        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Today
          </div>
          <div className="flex flex-col gap-2 font-mono" style={{ fontSize: 11.5 }}>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-faint)" }}>Leads hunted</span>
              <span style={{ color: "var(--fuchsia)", fontWeight: 700 }}>{stats.leadsToday}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-faint)" }}>Contacted</span>
              <span style={{ color: "var(--text)" }}>
                {stats.contacted} <span style={{ color: "var(--text-ghost)" }}>({responseRate}% resp.)</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-faint)" }}>Consulting</span>
              <span style={{ color: "var(--text)" }}>{stats.consulting}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--text-faint)" }}>Paid</span>
              <span style={{ color: "var(--violet)", fontWeight: 700 }}>{stats.paid}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
