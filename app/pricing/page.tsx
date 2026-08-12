import type { Metadata } from "next";
import { PRICING_PLANS } from "@/lib/stripe";
import CheckoutButton from "./CheckoutButton";

export const metadata: Metadata = {
  title: "Pricing | GYSM.IO",
  description: "Simple credit-based pricing for the GYSM.IO AI website builder.",
};

// Server Component now reading straight from lib/stripe.ts PRICING_PLANS --
// previously this page's data source wasn't traced to that file at all; the
// nearest thing was a hardcoded array in app/api/billing/plans/route.ts with
// prices mixed between EUR and USD. Checkout now actually exists (see
// app/api/billing/checkout/route.ts), which it did not before this pass.
export default function PricingPage({
  searchParams,
}: {
  searchParams: { reason?: string; canceled?: string };
}) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-white/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="opacity-30">.IO</span>
          </a>
          <a href="/builder" className="text-[11px] opacity-50 hover:opacity-100">
            Back to builder
          </a>
        </div>

        {searchParams.reason === "no_credits" && (
          <div className="max-w-2xl mx-auto mb-8 text-center rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            You're out of credits — pick a plan below to keep building.
          </div>
        )}
        {searchParams.canceled === "true" && (
          <div className="max-w-2xl mx-auto mb-8 text-center rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            Checkout canceled — no charge was made.
          </div>
        )}

        <h1 className="text-4xl md:text-6xl font-black text-center tracking-tighter mb-3">
          Simple pricing
        </h1>
        <p className="text-center opacity-50 mb-12">Start free, upgrade when you're shipping for real.</p>

        <div className="grid md:grid-cols-4 gap-4">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-6 border ${
                plan.highlight ? "bg-white text-black border-white" : "bg-white/5 border-white/10"
              }`}
            >
              <div className="text-xs opacity-50 uppercase tracking-widest">{plan.name}</div>
              <div className="flex gap-1 items-baseline mt-2">
                <span className="text-4xl font-black">€{plan.price}</span>
                <span className="text-sm opacity-60">{plan.interval === "month" ? "/mo" : ""}</span>
              </div>
              <p className="mt-3 text-sm opacity-80">{plan.description}</p>
              <p className="mt-1 text-xs opacity-50">{plan.builds} builds</p>
              <CheckoutButton planId={plan.id} label={`Get ${plan.name}`} highlight={plan.highlight} />
            </div>
          ))}
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
