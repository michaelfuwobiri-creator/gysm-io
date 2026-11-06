import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getCreditBalance } from "@/lib/credits";
import { getPlanById } from "@/lib/stripe";
import { getPlanUsage, hasMonthlyPlan, untilText, type PlanUsage } from "@/lib/planUsage";
import { PLAN_WINDOW_HOURS } from "@/lib/credits-constants";
import AppShell from "@/app/components/AppShell";
import BillingClient from "./BillingClient";

export const metadata = { title: "Billing | GYSM" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/billing");
  }

  const [credits, subRows] = await Promise.all([
    getCreditBalance(user.id),
    sql`select plan, status, current_period_end from subscriptions where user_id = ${user.id} limit 1`,
  ]);
  const sub = subRows[0] as { plan: string; status: string; current_period_end: string | null } | undefined;
  const planInfo = sub?.plan ? getPlanById(sub.plan) : undefined;
  const isActive = sub?.status === "active";
  const onPlan = await hasMonthlyPlan(user.id);
  const usage: PlanUsage | null = onPlan ? await getPlanUsage(user.id) : null;

  return (
    <AppShell active="billing">
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Billing</h1>
        <p className="text-[13px] text-black/40 mb-8">Your plan, credit balance, and subscription management.</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1">{onPlan ? "Credits from before" : "Credit balance"}</div>
            <div className="text-3xl font-black">{onPlan && usage ? Math.max(0, credits - usage.remaining) : credits}</div>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1">Current plan</div>
            <div className="text-3xl font-black">
              {isActive && planInfo ? planInfo.name : "Pay as you go"}
            </div>
            {isActive && sub?.current_period_end && (
              <p className="text-[11px] text-black/40 mt-1">
                Renews {new Date(sub.current_period_end).toLocaleDateString("en-US", { timeZone: "UTC" })}
              </p>
            )}
          </div>
        </div>

        {usage && (
          <div className="rounded-2xl border border-black/10 bg-white p-5 mb-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-4">Plan usage</div>
            <UsageBar
              label={`Current ${PLAN_WINDOW_HOURS}-hour window`}
              used={usage.windowUsed}
              limit={usage.windowLimit}
              note={usage.windowResetsAt ? `Resets in ${untilText(usage.windowResetsAt)}` : "Starts with your next request"}
            />
            <div className="h-4" />
            <UsageBar
              label="This week"
              used={usage.weekUsed}
              limit={usage.weekLimit}
              note={usage.weekResetsAt ? `Resets in ${untilText(usage.weekResetsAt)}` : "Starts with your next request"}
            />
            <p className="text-[11px] text-black/40 mt-4">
              Usage is measured by the real AI work each request takes. Long Agent builds use more than small edits.
            </p>
          </div>
        )}

        <BillingClient hasSubscription={isActive} />
      </div>
    </AppShell>
  );
}

function UsageBar({ label, used, limit, note }: { label: string; used: number; limit: number; note: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px] mb-1.5">
        <span className="font-semibold">{label}</span>
        <span className="text-black/50">{pct}% used</span>
      </div>
      <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 90 ? "#FF0080" : "#0A0A0A" }} />
      </div>
      <div className="text-[11px] text-black/40 mt-1">{note}</div>
    </div>
  );
}
