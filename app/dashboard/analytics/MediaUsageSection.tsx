import type { MediaUsageSummary } from "@/lib/mediaAnalytics";

// Media Factory usage summary (42-tool spec item 42) -- real aggregates
// from media_generations only, see lib/mediaAnalytics.ts for why there's
// no MRR or "views" figure here (neither is a meaningful/available
// number for this table).
export default function MediaUsageSection({ usage }: { usage: MediaUsageSummary }) {
  if (usage.totalGenerations === 0) {
    return (
      <div className="p-6 pt-0">
        <h2 className="text-lg font-black tracking-tight mb-1">Media Factory usage</h2>
        <p className="text-black/40 text-sm">
          No generations yet -- try an image, video, or voiceover skill in the builder.
        </p>
      </div>
    );
  }

  const successRate = Math.round(((usage.totalGenerations - usage.totalFailed) / usage.totalGenerations) * 100);

  return (
    <div className="p-6 pt-0">
      <h2 className="text-lg font-black tracking-tight mb-1">Media Factory usage</h2>
      <p className="text-black/40 text-sm mb-6">Real counts from your own generations -- no fabricated numbers.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total generations", value: usage.totalGenerations.toLocaleString() },
          { label: "Credits spent", value: usage.totalCreditsSpent.toLocaleString() },
          { label: "Last 30 days", value: usage.last30DaysCount.toLocaleString() },
          { label: "Success rate", value: `${successRate}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="text-xl font-black">{s.value}</div>
            <div className="text-[11px] text-black/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-3">By skill</div>
        <div className="space-y-2">
          {usage.byKind.map((k) => (
            <div key={k.kind} className="flex items-center justify-between text-[13px]">
              <span className="font-medium">{k.kind}</span>
              <span className="text-black/50">
                {k.count.toLocaleString()} gens -- {k.credits.toLocaleString()} credits
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
