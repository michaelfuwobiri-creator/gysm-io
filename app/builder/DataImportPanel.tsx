"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  provider?: "airtable" | "google_sheets";
  rowCount?: number;
  columns?: string[];
  status?: string;
  error_message?: string | null;
  last_synced_at?: string | null;
};

// "Bring your own data" -- standalone modal, same pattern as
// GitHubPushPanel, so wiring it into BuilderClient.tsx stays minimal.
// See app/api/connectors/data/* and lib/dataConnectors.ts for why this
// is a snapshot import rather than a live sync, and onConnected -- once
// data is imported, BuilderClient prepends it to the next prompt so the
// AI builds against real records instead of inventing placeholder items.
export default function DataImportPanel({
  projectId,
  onClose,
  onConnected,
}: {
  projectId: string;
  onClose: () => void;
  onConnected: (provider: "airtable" | "google_sheets", rows: Record<string, string>[]) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<"airtable" | "google_sheets">("airtable");
  const [token, setToken] = useState("");
  const [baseId, setBaseId] = useState("");
  const [table, setTable] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/connectors/data/status?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setStatus(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function connect() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string> =
        provider === "airtable"
          ? { projectId, provider, token: token.trim(), baseId: baseId.trim(), table: table.trim() }
          : { projectId, provider, csvUrl: csvUrl.trim() };
      const res = await fetch("/api/connectors/data/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect.");
        return;
      }
      setStatus({ connected: true, provider, rowCount: data.rowCount, columns: data.columns, status: "active", last_synced_at: new Date().toISOString() });
      onConnected(provider, data.rows || []);
    } catch {
      setError("Failed to connect. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function resync() {
    if (syncing) return;
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/connectors/data/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Re-sync failed.");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, rowCount: data.rowCount, columns: data.columns, last_synced_at: new Date().toISOString() } : prev));
      onConnected(status?.provider || "airtable", data.rows || []);
    } catch {
      setError("Re-sync failed. Check your connection and try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    await fetch("/api/connectors/data/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setStatus({ connected: false });
  }

  const canConnect = provider === "airtable" ? token.trim() && baseId.trim() && table.trim() : csvUrl.trim();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-black/10 shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black tracking-tight">Import data</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-black/45 text-[13px] mb-4">
          Import a snapshot from Airtable or a published Google Sheet -- your next prompt will build real content from these rows instead of invented placeholders. Re-sync any time to pull the latest data.
        </p>

        {loading ? (
          <div className="text-black/40 text-sm py-6 text-center">Loading…</div>
        ) : status?.connected ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px]">
              <div className="font-bold text-emerald-700">
                {status.provider === "airtable" ? "Airtable" : "Google Sheets"} -- {status.rowCount} row{status.rowCount === 1 ? "" : "s"} imported
              </div>
              {status.columns && status.columns.length > 0 && (
                <div className="text-emerald-700/60 mt-1">Columns: {status.columns.slice(0, 6).join(", ")}{status.columns.length > 6 ? "…" : ""}</div>
              )}
              {status.last_synced_at && (
                <div className="text-emerald-700/60 mt-1">Last synced {new Date(status.last_synced_at).toLocaleString()}</div>
              )}
            </div>
            {error && <div className="text-red-600 text-[13px]">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={resync}
                disabled={syncing}
                className="flex-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
              >
                {syncing ? "Syncing…" : "Re-sync"}
              </button>
              <button
                onClick={disconnect}
                className="py-2.5 px-4 rounded-full border border-black/15 text-black/60 text-[13px] font-bold hover:bg-black/5 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 bg-black/5 rounded-full p-1">
              <button
                onClick={() => setProvider("airtable")}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${provider === "airtable" ? "bg-white shadow-sm" : "text-black/50"}`}
              >
                Airtable
              </button>
              <button
                onClick={() => setProvider("google_sheets")}
                className={`flex-1 py-1.5 rounded-full text-xs font-bold transition ${provider === "google_sheets" ? "bg-white shadow-sm" : "text-black/50"}`}
              >
                Google Sheets
              </button>
            </div>

            {provider === "airtable" ? (
              <>
                <label className="text-[12px] font-bold text-black/50">
                  Personal access token
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="pat…"
                    className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                  />
                </label>
                <div className="flex gap-2">
                  <label className="flex-1 text-[12px] font-bold text-black/50">
                    Base ID
                    <input
                      value={baseId}
                      onChange={(e) => setBaseId(e.target.value)}
                      placeholder="app…"
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                  <label className="flex-1 text-[12px] font-bold text-black/50">
                    Table name
                    <input
                      value={table}
                      onChange={(e) => setTable(e.target.value)}
                      placeholder="Table 1"
                      className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                    />
                  </label>
                </div>
                <p className="text-black/30 text-[11px]">
                  Create a token at airtable.com/create/tokens with read access to this base. The base ID is in your base's API docs URL (starts with "app").
                </p>
              </>
            ) : (
              <>
                <label className="text-[12px] font-bold text-black/50">
                  Published CSV link
                  <input
                    value={csvUrl}
                    onChange={(e) => setCsvUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/…/pub?output=csv"
                    className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                  />
                </label>
                <p className="text-black/30 text-[11px]">
                  In Google Sheets: File → Share → Publish to web → choose CSV → copy that link.
                </p>
              </>
            )}

            {error && <div className="text-red-600 text-[13px]">{error}</div>}
            <button
              onClick={connect}
              disabled={saving || !canConnect}
              className="py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
            >
              {saving ? "Importing…" : "Import"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
