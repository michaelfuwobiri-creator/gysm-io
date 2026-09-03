"use client";

import { useState } from "react";
import { Icon } from "@/app/voiie/_components/icons";
import { apiPost } from "@/app/voiie/_components/api";
import { PLAN_DETAILS } from "@/types/voiie";
import type { VoiiePlanId } from "@/types/voiie";
import type { Toast } from "@/app/voiie/_components/useToasts";
import type { LeadDetail } from "@/app/voiie/_components/types";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function JsonPreview({ data }: { data: Record<string, unknown> }) {
  const render = (val: unknown, depth: number): React.ReactNode => {
    if (val === null || val === undefined) return <span style={{ color: "var(--text-ghost)" }}>null</span>;
    if (Array.isArray(val)) return <span>[<span style={{ color: "#fbbf24" }}>{val.map((v) => `"${v}"`).join(", ")}</span>]</span>;
    if (typeof val === "object") {
      const entries = Object.entries(val as Record<string, unknown>);
      return (
        <div style={{ paddingLeft: depth ? 12 : 0 }}>
          {"{"}
          {entries.map(([k, v], i) => (
            <div key={k} style={{ paddingLeft: 12 }}>
              <span style={{ color: "var(--fuchsia)" }}>{k}</span>: {render(v, depth + 1)}
              {i < entries.length - 1 ? "," : ""}
            </div>
          ))}
          {"}"}
        </div>
      );
    }
    if (typeof val === "string") return <span style={{ color: "#a7f3d0" }}>&quot;{val}&quot;</span>;
    return <span style={{ color: "#93c5fd" }}>{String(val)}</span>;
  };
  return (
    <div className="font-mono" style={{ fontSize: 11, lineHeight: 1.8, color: "var(--text-dim)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {render(data, 0)}
    </div>
  );
}

function DemoHtmlTab({ lead, pushToast }: { lead: LeadDetail; pushToast: (t: string, tone?: Toast["tone"]) => void }) {
  const [copied, setCopied] = useState(false);

  if (!lead.lead.demo_project_id) {
    return (
      <div style={{ padding: "30px 4px", textAlign: "center", color: "var(--text-ghost)", fontSize: 12.5 }}>
        No demo built yet. Finish the 12-question consultation, then hit &quot;Build Free Demo&quot; in the chat.
      </div>
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const publicUrl = lead.project?.custom_domain
    ? `https://${lead.project.custom_domain}`
    : `${siteUrl}/publish/${lead.lead.demo_project_id}`;

  return (
    <div className="flex flex-col gap-3">
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(0,0,0,.4)", aspectRatio: "16/9", background: "#08080a" }}>
        <iframe title="demo" src={publicUrl} style={{ width: "100%", height: "100%", border: "none" }} />
      </div>
      <div className="flex items-center gap-2" style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px" }}>
        <Icon.globe style={{ width: 13, height: 13, color: "var(--text-ghost)", flexShrink: 0 }} />
        <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {publicUrl}
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(publicUrl).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          style={{ color: "var(--fuchsia)", flexShrink: 0 }}
        >
          {copied ? <Icon.check style={{ width: 13, height: 13 }} /> : <Icon.copy style={{ width: 13, height: 13 }} />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5"
          style={{ border: "1px solid var(--border-strong)", borderRadius: 10, padding: "9px 6px", fontSize: 11.5, fontWeight: 600 }}
        >
          <Icon.ext style={{ width: 12, height: 12 }} />
          Open Demo
        </a>
        <a
          href={`/builder?projectId=${lead.lead.demo_project_id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5"
          onClick={() => pushToast("Opened in Builder", "violet")}
          style={{ border: "1px solid var(--border-strong)", borderRadius: 10, padding: "9px 6px", fontSize: 11.5, fontWeight: 600 }}
        >
          <Icon.wrench style={{ width: 12, height: 12 }} />
          Edit in Builder
        </a>
      </div>
      <div className="flex items-center justify-center gap-1.5" style={{ fontSize: 10.5, color: "var(--text-ghost)" }}>
        Built with the GYSM.IO builder &middot; free, live at /publish &middot; {lead.project?.views ?? 0} views
      </div>
    </div>
  );
}

function PaymentTab({ lead, onChanged, onLeadsChanged, pushToast }: { lead: LeadDetail; onChanged: () => void; onLeadsChanged: () => void; pushToast: (t: string, tone?: Toast["tone"]) => void }) {
  const [sendingPlan, setSendingPlan] = useState<VoiiePlanId | null>(null);
  const sentPlan = lead.lead.plan_id as VoiiePlanId | null;

  if (!lead.lead.demo_project_id) {
    return (
      <div style={{ padding: "30px 4px", textAlign: "center", color: "var(--text-ghost)", fontSize: 12.5 }}>
        Build the free demo first -- a plan is quoted against the live demo.
      </div>
    );
  }

  const sendPlan = async (plan: VoiiePlanId) => {
    setSendingPlan(plan);
    try {
      await apiPost<{ url: string }>(`/api/voiie/checkout/${lead.lead.id}`, { planId: plan });
      pushToast(`${PLAN_DETAILS[plan].label} checkout link sent to ${lead.lead.contact_phone || lead.lead.contact_email || lead.lead.handle}`, "cyan");
      onChanged();
      onLeadsChanged();
    } catch (err) {
      pushToast((err as Error).message, "cyan");
    } finally {
      setSendingPlan(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {(Object.keys(PLAN_DETAILS) as VoiiePlanId[]).map((id) => {
        const p = PLAN_DETAILS[id];
        const reco = id === "voiie_pro";
        return (
          <div key={id} className={"card-plan " + (reco ? "reco" : "")}>
            {reco && (
              <div className="grad-fv" style={{ position: "absolute", top: -9, right: 14, fontSize: 9, fontWeight: 800, letterSpacing: ".04em", color: "#fff", padding: "3px 9px", borderRadius: 9999 }}>
                RECOMMENDED
              </div>
            )}
            <div className="flex items-baseline gap-1">
              <span style={{ fontSize: 24, fontWeight: 800 }}>{p.label}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{p.title}</div>
            <div className="flex flex-col gap-1.5" style={{ fontSize: 11, color: "var(--text-faint)" }}>
              {p.items.map((it) => (
                <div key={it} className="flex items-center gap-1.5">
                  <Icon.check style={{ width: 11, height: 11, color: reco ? "var(--fuchsia)" : "var(--text-ghost)", flexShrink: 0 }} />
                  {it}
                </div>
              ))}
            </div>
            <button
              disabled={sendingPlan === id}
              onClick={() => sendPlan(id)}
              className={reco ? "grad-fv" : ""}
              style={{ marginTop: 4, fontSize: 12, fontWeight: 700, padding: "9px 0", borderRadius: 9999, color: reco ? "#fff" : "var(--text)", border: reco ? "none" : "1px solid var(--border-strong)" }}
            >
              {sendingPlan === id ? "Creating checkout..." : `Send ${p.label} Checkout Link`}
            </button>
            {sentPlan === id && (
              <div className="font-mono" style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 10, padding: 9, fontSize: 10.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
                A real Stripe checkout link for {p.label} was sent. Once they pay, GYSM.IO creates their account and hands them the build automatically.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductionTab({ lead }: { lead: LeadDetail }) {
  if (lead.lead.status !== "converted") {
    return (
      <div style={{ padding: "30px 4px", textAlign: "center", color: "var(--text-ghost)", fontSize: 12.5 }}>
        Nothing in production yet. Send a checkout link and wait for payment to deploy.
      </div>
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const publicUrl = lead.project?.custom_domain ? `https://${lead.project.custom_domain}` : `${siteUrl}/publish/${lead.lead.demo_project_id}`;
  const plan = lead.lead.plan_id ? PLAN_DETAILS[lead.lead.plan_id as VoiiePlanId] : null;

  return (
    <div className="flex flex-col gap-3">
      <div style={{ background: "var(--violet-soft)", border: "1px solid rgba(139,92,246,.35)", borderRadius: 12, padding: 12 }}>
        <div className="flex items-center gap-1.5">
          <span className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: 9999, background: "var(--violet)" }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "#c4b5fd" }}>
            {plan?.label ?? "Paid"} &middot; Customer since {lead.lead.converted_at ? fmtDate(lead.lead.converted_at) : "—"}
          </span>
        </div>
      </div>

      <div style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div className="field-label">Production URL</div>
        <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
          <span className="animate-pulse-dot" style={{ width: 7, height: 7, borderRadius: 9999, background: "var(--violet)" }} />
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-mono" style={{ fontSize: 12, color: "var(--text)" }}>
            {publicUrl}
          </a>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--text-ghost)", marginTop: 6 }}>
          {lead.project?.custom_domain_status === "verified" ? "Custom domain verified" : "On the free gysm.io/publish URL -- connect a custom domain from the builder anytime"}
        </div>
      </div>

      <div style={{ background: "#08080a", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div className="field-label">Account</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
          They now have a real GYSM.IO account with their own credits -- they can sign in with{" "}
          <span className="font-mono">{lead.lead.contact_email}</span> to manage the build, or you can keep managing renewals/upgrades from here.
        </div>
      </div>
    </div>
  );
}

export function RightPanel({
  lead,
  onChanged,
  onLeadsChanged,
  pushToast,
}: {
  lead: LeadDetail | null;
  onChanged: () => void;
  onLeadsChanged: () => void;
  pushToast: (text: string, tone?: Toast["tone"]) => void;
}) {
  const [tab, setTab] = useState<"data" | "demo" | "payment" | "production">("data");

  if (!lead) return <div style={{ width: 380, flexShrink: 0, background: "var(--panel-1)" }} />;

  const tabs: Array<[typeof tab, string]> = [
    ["data", "Consultation Data"],
    ["demo", "Demo"],
    ["payment", "Payment"],
    ["production", "Production"],
  ];

  return (
    <div style={{ width: 380, flexShrink: 0, background: "var(--panel-1)", borderLeft: "1px solid var(--border)" }} className="flex flex-col h-full">
      <div className="flex" style={{ borderBottom: "1px solid var(--border)", padding: "0 12px" }}>
        {tabs.map(([id, label]) => (
          <div key={id} className={"tab-btn flex-1 " + (tab === id ? "active" : "")} onClick={() => setTab(id)}>
            {label}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        {tab === "data" &&
          (Object.keys(lead.consultation.answers ?? {}).length ? (
            <JsonPreview data={lead.consultation.answers} />
          ) : (
            <div style={{ padding: "30px 4px", textAlign: "center", color: "var(--text-ghost)", fontSize: 12.5 }}>No answers collected yet.</div>
          ))}
        {tab === "demo" && <DemoHtmlTab lead={lead} pushToast={pushToast} />}
        {tab === "payment" && <PaymentTab lead={lead} onChanged={onChanged} onLeadsChanged={onLeadsChanged} pushToast={pushToast} />}
        {tab === "production" && <ProductionTab lead={lead} />}
      </div>
    </div>
  );
}
