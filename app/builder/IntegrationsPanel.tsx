"use client";

import { useEffect, useState } from "react";

type Status = {
  posthog: { connected: boolean; host?: string };
  resend: { connected: boolean; notifyEmail?: string };
};

// PostHog (analytics) + Resend (contact-form email) -- see
// app/api/connectors/integrations/* and app/api/connectors/email/send.
// Unlike DataImportPanel, connecting here applies to every future
// generation for this project automatically (app/api/generate/route.ts
// looks these up itself), not just the next one -- there's nothing to
// "prepend" from the client here.
export default function IntegrationsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"posthog" | "resend">("posthog");
  const [posthogKey, setPosthogKey] = useState("");
  const [posthogHost, setPosthogHost] = useState("https://us.i.posthog.com");
  const [resendKey, setResendKey] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/connectors/integrations/status?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setStatus(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function connect(provider: "posthog" | "resend") {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body =
        provider === "posthog"
          ? { projectId, provider, apiKey: posthogKey.trim(), host: posthogHost.trim() }
          : { projectId, provider, apiKey: resendKey.trim(), notifyEmail: notifyEmail.trim() };
      const res = await fetch("/api/connectors/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect.");
        return;
      }
      setStatus((prev) => ({
        posthog: provider === "posthog" ? { connected: true, host: posthogHost } : prev?.posthog || { connected: false },
        resend: provider === "resend" ? { connected: true, notifyEmail } : prev?.resend || { connected: false },
      }));
    } catch {
      setError("Failed to connect. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(provider: "posthog" | "resend") {
    await fetch("/api/connectors/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, provider }),
    });
    setStatus((prev) => (prev ? { ...prev, [provider]: { connected: false } } : prev));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/10 shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black tracking-tight">Integrations</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-black/45 text-[13px] mb-4">Connect analytics or email delivery -- applied automatically to every future edit of this build.</p>

        {loading ? (
          <div className="text-black/40 text-sm py-6 text-center">Loading…</div>
        ) : (
          <>
            <div className="flex gap-1 bg-black/5 rounded-full p-1 mb-4">
              <button onClick={() => setTab("posthog")} className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${tab === "posthog" ? "bg-white shadow-sm" : "text-black/50"}`}>
                Analytics
              </button>
              <button onClick={() => setTab("resend")} className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${tab === "resend" ? "bg-white shadow-sm" : "text-black/50"}`}>
                Email
              </button>
            </div>

            {tab === "posthog" &&
              (status?.posthog.connected ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px]">
                    <div className="font-bold text-emerald-700">PostHog connected</div>
                    <div className="text-emerald-700/60 mt-1">{status.posthog.host}</div>
                  </div>
                  <button onClick={() => disconnect("posthog")} className="py-2.5 rounded-full border border-black/15 text-black/60 text-[13px] font-bold hover:bg-black/5 transition">
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <label className="text-[12px] font-bold text-black/50">
                    Project API key
                    <input
                      value={posthogKey}
                      onChange={(e) => setPosthogKey(e.target.value)}
                      placeholder="phc_…"
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                  <label className="text-[12px] font-bold text-black/50">
                    Host
                    <input
                      value={posthogHost}
                      onChange={(e) => setPosthogHost(e.target.value)}
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                  {error && <div className="text-red-600 text-[13px]">{error}</div>}
                  <button
                    onClick={() => connect("posthog")}
                    disabled={saving || !posthogKey.trim()}
                    className="mt-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
                  >
                    {saving ? "Connecting…" : "Connect"}
                  </button>
                  <p className="text-black/30 text-[11px]">
                    Find your project API key at app.posthog.com → Project settings. This key is meant to be public (it's embedded in the app itself).
                  </p>
                </div>
              ))}

            {tab === "resend" &&
              (status?.resend.connected ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px]">
                    <div className="font-bold text-emerald-700">Resend connected</div>
                    <div className="text-emerald-700/60 mt-1">Notifications go to {status.resend.notifyEmail}</div>
                  </div>
                  <button onClick={() => disconnect("resend")} className="py-2.5 rounded-full border border-black/15 text-black/60 text-[13px] font-bold hover:bg-black/5 transition">
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <label className="text-[12px] font-bold text-black/50">
                    API key
                    <input
                      type="password"
                      value={resendKey}
                      onChange={(e) => setResendKey(e.target.value)}
                      placeholder="re_…"
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                  <label className="text-[12px] font-bold text-black/50">
                    Send notifications to
                    <input
                      type="email"
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                  {error && <div className="text-red-600 text-[13px]">{error}</div>}
                  <button
                    onClick={() => connect("resend")}
                    disabled={saving || !resendKey.trim() || !notifyEmail.trim()}
                    className="mt-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
                  >
                    {saving ? "Connecting…" : "Connect"}
                  </button>
                  <p className="text-black/30 text-[11px]">
                    Get a key at resend.com/api-keys. Any contact/feedback form this build has will deliver here -- never to an address a visitor controls.
                  </p>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
