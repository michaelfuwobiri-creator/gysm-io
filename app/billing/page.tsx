import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getCreditBalance } from "@/lib/credits";
import { getPlanById } from "@/lib/stripe";
import AppShell from "@/app/components/AppShell";
import BillingClient from "./BillingClient";

export const metadata = { title: "Billing | GYSM.IO" };
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

  return (
    <AppShell active="billing">
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Billing</h1>
        <p className="text-[13px] text-black/40 mb-8">Your plan, credit balance, and subscription management.</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1">Credit balance</div>
            <div className="text-3xl font-black">{credits}</div>
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

        <BillingClient hasSubscription={isActive} />
      </div>
    </AppShell>
  );
}
