"use client";

import { Icon } from "@/app/voiie/_components/icons";
import type { VoiieLead } from "@/app/voiie/_components/types";

const PLATFORM_META: Record<string, { color: string; Icon: typeof Icon.twitter }> = {
  twitter: { color: "#1d9bf0", Icon: Icon.twitter },
  threads: { color: "#f8fafc", Icon: Icon.threads },
  manual: { color: "#8b5cf6", Icon: Icon.bolt },
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  consulting: "Consulting",
  demo_sent: "Demo Sent",
  negotiating: "Negotiating",
  paid: "Paid",
  converted: "Converted",
  lost: "Lost",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LeftPanel({
  leads,
  activeLeadId,
  setActiveLeadId,
  search,
  setSearch,
  stats,
}: {
  leads: VoiieLead[];
  activeLeadId: string | null;
  setActiveLeadId: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
  stats: { leadsToday: number; contacted: number; consulting: number; demoSent: number };
}) {
  return (
    <div style={{ width: 300, flexShrink: 0, background: "var(--panel-1)", borderRight: "1px solid var(--border)" }} className="flex flex-col h-full">
      <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div
            className="avatar-grad shadow-glow-fuchsia"
            style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}
          >
            V
          </div>
          <div className="flex flex-col leading-tight">
            <span style={{ fontWeight: 800, fontSize: 14 }}>
              VOIIE <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>&middot; GYSM.IO</span>
            </span>
            <div className="flex items-center gap-1.5" style={{ marginTop: 2 }}>
              <span className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--fuchsia)" }} />
              <span className="font-mono" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--fuchsia)" }}>
                LIVE HUNTING
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5" style={{ marginTop: 14 }}>
          {[
            ["Today", stats.leadsToday],
            ["Contact", stats.contacted],
            ["Consult", stats.consulting],
            ["Demo", stats.demoSent],
          ].map(([lab, val]) => (
            <div key={lab} style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 4px", textAlign: "center" }}>
              <div className="font-mono grad-fv-text" style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>
                {val}
              </div>
              <div style={{ fontSize: 8.5, color: "var(--text-ghost)", marginTop: 3, letterSpacing: ".02em" }}>{lab}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 14px" }}>
        <div className="relative">
          <Icon.search style={{ width: 14, height: 14, position: "absolute", left: 11, top: 11, color: "var(--text-ghost)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search handles..."
            style={{ width: "100%", height: 36, background: "#08080a", border: "1px solid var(--border)", borderRadius: 12, paddingLeft: 32, paddingRight: 12, fontSize: 12.5, color: "var(--text)" }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 10 }}>
        {leads.map((lead) => {
          const meta = PLATFORM_META[lead.platform] ?? PLATFORM_META.twitter;
          return (
            <div
              key={lead.id}
              onClick={() => setActiveLeadId(lead.id)}
              className={"lead-card " + (lead.id === activeLeadId ? "active" : "")}
              style={{ padding: "11px 14px", display: "flex", gap: 10 }}
            >
              <div
                className="avatar-grad"
                style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}
              >
                {lead.handle.replace("@", "")[0]?.toUpperCase() ?? "V"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{lead.handle}</span>
                  <meta.Icon style={{ width: 11, height: 11, color: meta.color, flexShrink: 0 }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {lead.signal || "manually added"}
                </div>
                <div className="flex items-center gap-1.5" style={{ marginTop: 6 }}>
                  <span className={"status-pill status-" + lead.status}>{STATUS_LABEL[lead.status] ?? lead.status}</span>
                </div>
              </div>
              <div style={{ fontSize: 9.5, color: "var(--text-ghost)", flexShrink: 0, alignSelf: "flex-start" }}>{timeAgo(lead.created_at)}</div>
            </div>
          );
        })}
        {leads.length === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-ghost)" }}>No leads match &quot;{search}&quot;</div>}
      </div>
    </div>
  );
}
