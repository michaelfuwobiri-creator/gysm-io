import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import { PRICING_PLANS } from "@/lib/stripe";

export default async function AdminAnalyticsPage() {
  noStore();
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const [mrrRows, activeUsersRows, buildsPerDayRows, totalsRows] = await Promise.all([
    safeQuery(() => sql`select plan, count(*)::int as count from subscriptions where status = 'active' group by plan`, []),
    safeQuery(() => sql`select count(distinct user_id)::int as count from projects where created_at > now() - interval '30 days'`, [{ count: 0 }]),
    safeQuery(() => sql`select date_trunc('day', created_at) as day, count(*)::int as count from projects where created_at > now() - interval '14 days' and is_template = false group by 1 order by 1 asc`, []),
    safeQuery(() => sql`select (select count(*)::int from projects where is_template = false) as total_builds, (select count(*)::int from subscriptions where status = 'active') as active_subs`, [{ total_builds: 0, active_subs: 0 }]),
  ]);

  const priceByPlan = new Map(PRICING_PLANS.filter((p) => p.interval === "month").map((p) => [p.id, p]));
  let mrr = 0;
  const mrrBreakdown: { planId: string; planName: string; count: number; subtotal: number }[] = [];
  for (const row of mrrRows as any[]) {
    const plan = priceByPlan.get(row.plan);
    if (!plan) continue;
    const subtotal = plan.price * row.count;
    mrr += subtotal;
    mrrBreakdown.push({ planId: plan.id, planName: plan.name, count: row.count, subtotal });
  }
  mrrBreakdown.sort((a, b) => b.subtotal - a.subtotal);

  const activeUsers30d = (activeUsersRows as any[])[0]?.count ?? 0;
  const totals = (totalsRows as any[])[0] ?? { total_builds: 0, active_subs: 0 };
  const buildsByDay = new Map<string, number>((buildsPerDayRows as any[]).map((r) => [fmtDay(r.day), r.count]));
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ label: key.slice(5), count: buildsByDay.get(key) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-6 md:p-10">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="text-2xl md:text-3xl font-black tracking-[-0.02em]">Analytics</h1>
        <p className="mt-1 text-[13px] text-white/40">Live from Neon -- no sample data.</p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="MRR" value={`$${mrr.toLocaleString()}`} sub={`${totals.active_subs} active subscription${totals.active_subs === 1 ? "" : "s"}`} />
          <StatCard label="Active users (30d)" value={activeUsers30d.toLocaleString()} sub="distinct users who generated or edited a build" />
          <StatCard label="Total builds" value={totals.total_builds.toLocaleString()} sub="all-time, excluding templates" />
        </div>
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">MRR by plan</div>
          {mrrBreakdown.length === 0 ? (
            <div className="mt-3 text-[13px] text-white/40">No active monthly subscriptions yet.</div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {mrrBreakdown.map((row) => (
                <div key={row.planId} className="flex items-center justify-between text-[13px]">
                  <div className="font-medium">{row.planName} <span className="text-white/30">x{row.count}</span></div>
                  <div className="font-bold">${row.subtotal.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 rounded-[20px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">Builds per day (last 14 days)</div>
          <div className="mt-6 flex items-end gap-2 h-[140px]">
            {days.map((d) => (
              <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md bg-gradient-to-t from-[#FF0080] to-fuchsia-400" style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }} title={`${d.count} build${d.count === 1 ? "" : "s"}`} />
                <div className="text-[10px] text-white/30">{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-white/40">{label}</div>
      <div className="mt-2 text-[32px] font-black tracking-[-0.02em]">{value}</div>
      <div className="mt-1 text-[12px] text-white/30">{sub}</div>
    </div>
  );
}

function fmtDay(d: unknown): string {
  const date = d instanceof Date ? d : new Date(String(d));
  return date.toISOString().slice(0, 10);
}

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch (error: any) { console.error("[admin/analytics] query failed:", error?.message || error); return fallback; }
}
