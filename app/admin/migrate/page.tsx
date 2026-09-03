"use client";

import { useState } from "react";

// Admin-only one-click migration runner. Posts to the same
// /api/admin/migrate endpoint that already gates on isAdminEmail() --
// this page is just a UI for it so pending db/migrations/*.sql files
// (0010 through 0019 as of this page's creation) can be applied against
// the live Neon database without hand-pasting SQL into console.neon.tech,
// which is easy to get wrong from a terminal (typing a filename instead
// of its contents does nothing, silently).
type Result = { id: string; ok: boolean; error?: string };

export default function AdminMigratePage() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setFatalError(null);
    setResults(null);
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFatalError(data?.error || `Request failed (${res.status}).`);
      } else {
        setResults(data.results || []);
      }
    } catch (err: any) {
      setFatalError(err?.message || "Network error.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "48px auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Run Pending Migrations</h1>
      <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.5 }}>
        Applies every statement in <code>app/api/admin/migrate/route.ts</code> against
        the live database. Every statement is <code>IF NOT EXISTS</code>, so this is
        safe to run repeatedly -- already-applied tables/columns are silently skipped.
        Admin-only (checked server-side on every click).
      </p>
      <button
        onClick={run}
        disabled={running}
        style={{
          background: running ? "#999" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 20px",
          fontSize: 15,
          fontWeight: 600,
          cursor: running ? "default" : "pointer",
        }}
      >
        {running ? "Running..." : "Run migrations"}
      </button>

      {fatalError && (
        <p style={{ color: "#c00", marginTop: 20 }}>Error: {fatalError}</p>
      )}

      {results && (
        <table style={{ marginTop: 24, width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "6px 8px" }}>Statement</th>
              <th style={{ padding: "6px 8px" }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{r.id}</td>
                <td style={{ padding: "6px 8px", color: r.ok ? "#0a0" : "#c00" }}>
                  {r.ok ? "OK" : `Failed: ${r.error}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
