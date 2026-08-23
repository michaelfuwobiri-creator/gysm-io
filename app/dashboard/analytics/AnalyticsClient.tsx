"use client";

import { useState, useCallback } from "react";
import type { DailyViews, ReferrerCount, ProjectOption } from "@/lib/analytics";

const WINDOWS = [7, 30, 90] as const;

export default function AnalyticsClient({
  projects,
  initialDaily,
  initialReferrers,
}: {
  projects: ProjectOption[];
  initialDaily: DailyViews[];
  initialReferrers: ReferrerCount[];
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [daily, setDaily] = useState<DailyViews[]>(initialDaily);
  const [referrers, setReferrers] = useState<ReferrerCount[]>(initialReferrers);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async (nextProjectId: string, nextDays: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(nextDays) });
      if (nextProjectId) params.set("projectId", nextProjectId);
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDaily(data.daily ?? []);
        setReferrers(data.referrers ?? []);
      }
    } catch {
      // Non-critical -- filters just stay on the last good data.
    } finally {
      setLoading(false);
    }
  }, []);

  const totalInWindow = daily.reduce((sum, d) => sum + d.count, 0);
  const max = Math.max(1, ...daily.map((d) => d.count));

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-black tracking-tight mb-1">Analytics</h1>
        <p className="text-black/40 text-sm mb-8">Real views on your published builds -- no publish, no data yet.</p>
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-black/40 text-sm">
          Publish a build from the dashboard to start tracking views for it here.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-1">Analytics</h1>
          <p className="text-black/40 text-sm">Real views on your published builds, logged per visit -- not estimated.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              refetch(e.target.value, days);
            }}
            className="h-9 px-3 rounded-lg border border-black/10 bg-white text-[13px] font-semibold outline-none"
          >
            <option value="">All published builds</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <div className="flex items-center h-9 rounded-lg border border-black/10 bg-black/[0.02] p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => {
                  setDays(w);
                  refetch(projectId, w);
                }}
                className={`h-8 px-3 rounded-md text-[12px] font-bold transition ${
                  days === w ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/70"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid md:grid-cols-3 gap-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
        <div className="md:col-span-2 rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-black/40">Views, last {days} days</span>
            <span className="text-2xl font-black">{totalInWindow.toLocaleString()}</span>
          </div>
          <div className="flex items-end gap-[3px] h-[140px]">
            {daily.map((d) => (
              <div key={d.date} className="flex-1 min-w-[2px] group relative">
                <div
                  className="w-full rounded-t-sm bg-gradient-to-t from-fuchsia-400 to-violet-500 hover:opacity-80 transition"
                  style={{ height: `${Math.max(2, (d.count / max) * 140)}px` }}
                  title={`${d.date}: ${d.count} view${d.count === 1 ? "" : "s"}`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-black/30">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-black/40 block mb-4">Top referrers</span>
          {referrers.length === 0 ? (
            <p className="text-black/30 text-[13px]">No views in this window yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {referrers.map((r) => {
                const pct = referrers[0].count > 0 ? (r.count / referrers[0].count) * 100 : 0;
                return (
                  <div key={r.referrer}>
                    <div className="flex justify-between text-[12.5px] font-semibold mb-1">
                      <span className="truncate">{r.referrer}</span>
                      <span className="text-black/40 shrink-0 ml-2">{r.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
