"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/voiie/_components/icons";
import { apiGet, apiPatch, apiPost } from "@/app/voiie/_components/api";
import { DEFAULT_HUNT_QUERY, DEFAULT_PLACES_QUERY, DEFAULT_OUTREACH_TEMPLATE as DEFAULT_TEMPLATE } from "@/lib/voiie/constants";
import type { Toast } from "@/app/voiie/_components/useToasts";
import type { VoiieLead } from "@/app/voiie/_components/types";
import type { VoiieSettings } from "@/types/voiie";

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
  const [placesQuery, setPlacesQuery] = useState(DEFAULT_PLACES_QUERY);
  const [platforms, setPlatforms] = useState({ Twitter: true, Threads: true, Places: false });
  const [scanning, setScanning] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [channels, setChannels] = useState({ twitter: true, whatsapp: true, email: true });
  const [autoOutreach, setAutoOutreach] = useState(false);

  // Anti-spam / hunt-safety controls -- persisted server-side (voiie_settings,
  // see app/api/voiie/settings/route.ts) and actually enforced by
  // lib/voiie/hunt.ts (daily cap, kill switch, blacklist) and
  // lib/voiie/outreach.ts (kill switch, spintax), not just cosmetic here.
  const [settings, setSettings] = useState<VoiieSettings | null>(null);
  const [blacklistDraft, setBlacklistDraft] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    apiGet<{ settings: VoiieSettings }>("/api/voiie/settings")
      .then((data) => {
        setSettings(data.settings);
        setBlacklistDraft(data.settings.blacklist.join(", "));
      })
      .catch((err) => pushToast((err as Error).message, "cyan"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSettings = async (patch: Partial<VoiieSettings>) => {
    if (!settings) return;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    setSavingSettings(true);
    try {
      const data = await apiPatch<{ settings: VoiieSettings }>("/api/voiie/settings", patch);
      setSettings(data.settings);
    } catch (err) {
      pushToast((err as Error).message, "cyan");
      setSettings(settings); // revert optimistic update on failure
    } finally {
      setSavingSettings(false);
    }
  };

  const huntNow = async () => {
    setScanning(true);
    try {
      const platformList = Object.entries(platforms)
        .filter(([, on]) => on)
        .map(([p]) => p.toLowerCase());
      const result = await apiPost<{ newLeadsCreated: number; scanned: number; skippedReason?: "kill_switch" | "daily_limit_reached" }>("/api/voiie/hunt", {
        query: huntQuery,
        placesQuery,
        platforms: platformList,
      });
      onHunted();
      if (result.skippedReason === "kill_switch") {
        pushToast("Hunt skipped — kill switch is on. Flip it off in Anti-Spam to resume.", "cyan");
      } else if (result.skippedReason === "daily_limit_reached") {
        pushToast("Hunt skipped — today's daily limit is already reached.", "cyan");
      } else {
        pushToast(
          result.newLeadsCreated > 0
            ? `${result.newLeadsCreated} new lead(s) hunted`
            : `Scanned ${result.scanned} post(s) — no new leads this pass`,
          "fuchsia"
        );
      }
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
              ["Places", "#34d399"],
            ].map(([p, c]) => (
              <div key={p} className="flex items-center justify-between">
                <span style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 9999, background: c }} />
                  {p}
                </span>
                <div className={"toggle " + (platforms[p as "Twitter" | "Threads" | "Places"] ? "on" : "")} onClick={() => setPlatforms((s) => ({ ...s, [p]: !s[p as "Twitter" | "Threads" | "Places"] }))}>
                  <div className="knob" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {platforms.Places && (
          <div style={{ marginTop: 14 }}>
            <div className="field-label" style={{ marginBottom: 6 }}>
              Places Location (e.g. &quot;plumbers in Austin, TX&quot;)
            </div>
            <input
              value={placesQuery}
              onChange={(e) => setPlacesQuery(e.target.value)}
              placeholder="category in city, state"
              className="font-mono"
              style={{ width: "100%", background: "#0a0a0d", border: "1px solid var(--border)", borderRadius: 10, padding: 9, fontSize: 10.5, color: "var(--text-dim)" }}
            />
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-dim)", opacity: 0.7 }}>
              Finds real local businesses in this area with no website on file &mdash; needs GOOGLE_PLACES_API_KEY configured.
            </div>
          </div>
        )}

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
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div className="field-label">Anti-Spam</div>
            {settings && (
              <span style={{ fontSize: 9, color: settings.kill_switch ? "#ff4d4d" : "#22c55e", display: "flex", alignItems: "center", gap: 4, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: 9999, background: settings.kill_switch ? "#ff4d4d" : "#22c55e" }} />
                {settings.kill_switch ? "PAUSED" : "ACTIVE"}
              </span>
            )}
          </div>

          {!settings ? (
            <div style={{ fontSize: 10.5, color: "var(--text-ghost)" }}>Loading settings…</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div className="flex justify-between" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5 }}>
                  <span>Daily limit</span>
                  <span style={{ color: "var(--fuchsia)", fontWeight: 700 }}>{settings.daily_hunt_limit}/day</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={200}
                  step={5}
                  value={settings.daily_hunt_limit}
                  onChange={(e) => setSettings((s) => (s ? { ...s, daily_hunt_limit: Number(e.target.value) } : s))}
                  onMouseUp={(e) => saveSettings({ daily_hunt_limit: Number((e.target as HTMLInputElement).value) })}
                  onTouchEnd={(e) => saveSettings({ daily_hunt_limit: Number((e.target as HTMLInputElement).value) })}
                  style={{ width: "100%", accentColor: "var(--fuchsia)" }}
                />
              </div>

              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Spintax (vary outreach text)</span>
                <div className={"toggle " + (settings.spintax_enabled ? "on" : "")} onClick={() => saveSettings({ spintax_enabled: !settings.spintax_enabled })}>
                  <div className="knob" />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div className="field-label" style={{ marginBottom: 6 }}>
                  Blacklist (do-not-contact)
                </div>
                <input
                  value={blacklistDraft}
                  onChange={(e) => setBlacklistDraft(e.target.value)}
                  onBlur={() => saveSettings({ blacklist: blacklistDraft.split(",").map((h) => h.trim()).filter(Boolean) })}
                  placeholder="@handle, @another"
                  style={{ width: "100%", background: "#0a0a0d", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 9px", fontSize: 11, color: "var(--text-dim)" }}
                />
              </div>

              <div
                className="flex items-center justify-between"
                style={{ background: settings.kill_switch ? "rgba(255,77,77,.08)" : "#0a0a0d", border: `1px solid ${settings.kill_switch ? "#ff4d4d55" : "var(--border)"}`, borderRadius: 12, padding: "10px 12px" }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: settings.kill_switch ? "#ff4d4d" : "var(--text)" }}>Kill Switch</div>
                  <div style={{ fontSize: 9.5, color: "var(--text-ghost)" }}>Pauses hunting + outreach immediately</div>
                </div>
                <div className={"toggle " + (settings.kill_switch ? "on" : "")} onClick={() => saveSettings({ kill_switch: !settings.kill_switch })}>
                  <div className="knob" />
                </div>
              </div>
              {savingSettings && <div style={{ fontSize: 9, color: "var(--text-ghost)", marginTop: 6 }}>Saving…</div>}
            </>
          )}
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
