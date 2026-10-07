"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SecurityOverview } from "@/lib/securitySummary";

const LEVEL_LABEL = {
  secret: { text: "Exposed key", cls: "bg-red-500/10 text-red-700" },
  quality: { text: "Needs a look", cls: "bg-amber-500/10 text-amber-700" },
  unchecked: { text: "Not scanned", cls: "bg-black/5 text-black/50" },
  clean: { text: "Clean", cls: "bg-emerald-500/10 text-emerald-700" },
} as const;

export default function SecurityClient({ overview }: { overview: SecurityOverview }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function scanAll() {
    if (scanning) return;
    setScanning(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/security/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scan failed.");
        return;
      }
      setNotice(`Scanned ${data.scanned} build${data.scanned === 1 ? "" : "s"}.`);
      router.refresh();
    } catch {
      setError("Scan failed. Check your connection and try again.");
    } finally {
      setScanning(false);
    }
  }

  const stats: [string, number][] = [
    ["Builds", overview.total],
    ["Exposed keys", overview.withSecrets],
    ["Need a look", overview.withQualityIssues],
    ["Not scanned", overview.unchecked],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-2xl font-black">{n}</div>
            <div className="text-[12px] text-black/40">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={scanAll}
          disabled={scanning}
          className="px-4 py-2 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
        >
          {scanning ? "Scanning…" : "Scan all builds"}
        </button>
        <span className="text-[12px] text-black/40">Scans your 50 most recent builds. Free: no credits used.</span>
      </div>
      {error && <div className="text-red-600 text-[13px] mb-4">{error}</div>}
      {notice && <div className="text-emerald-700 text-[13px] mb-4">{notice}</div>}

      {overview.total === 0 ? (
        <p className="text-[13px] text-black/40">No builds yet. Once you build something it will show up here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {overview.builds.map((b) => {
            const tag = LEVEL_LABEL[b.level];
            return (
              <li key={b.id} className="rounded-xl border border-black/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold truncate">{b.label}</div>
                    <div className="text-[11px] text-black/40 mt-0.5">
                      {b.isPublic ? "Listed in BuildGuild" : "Not listed in BuildGuild"}
                      {b.checkedAt ? ` · scanned ${new Date(b.checkedAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold rounded-full px-2.5 py-1 ${tag.cls}`}>{tag.text}</span>
                </div>
                {b.secrets.length > 0 && (
                  <ul className="mt-3 text-[13px] text-red-700 list-disc pl-5 space-y-1">
                    {b.secrets.map((s, i) => (
                      <li key={i}>
                        {s.message}
                        {s.detail ? <span className="text-red-700/60"> ({s.detail})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {b.quality.length > 0 && (
                  <ul className="mt-3 text-[13px] text-black/60 list-disc pl-5 space-y-1">
                    {b.quality.map((q, i) => (
                      <li key={i}>{q.message}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-4 text-[12px] font-bold">
                  <a href={`/builder?projectId=${b.id}`} className="underline">Open in builder</a>
                  <a href={`/publish/${b.id}`} className="underline" target="_blank" rel="noopener noreferrer">View page</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-black/30 mt-8">
        If a key was exposed, removing it from the page is not enough: rotate it with the provider that issued it, because
        anyone who opened the page may already have copied it.
      </p>
    </div>
  );
}
