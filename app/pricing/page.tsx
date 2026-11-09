import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PRICING_PLANS, formatPlanPrice } from "@/lib/stripe";
import { PLAN_WINDOW_HOURS } from "@/lib/credits-constants";
import CheckoutButton from "./CheckoutButton";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

// ssr:false island for the 3 optional query-string banners (?reason=,
// ?canceled=, ?upsell=) -- see PricingBanners.tsx for why: reading
// `searchParams` directly on this page forced the whole route into
// fully-dynamic per-request rendering (confirmed live: x-vercel-cache MISS,
// age 0 on every load, vs the homepage's cached HIT), and that was the one
// structural difference left between "/" (confirmed clean, twice) and
// "/pricing" (still throwing #418/#423/#425 on every load) after every
// other fix had already landed. Moving the searchParams read client-side
// lets this page go back to being static like the homepage.
const PricingBanners = dynamic(() => import("./PricingBanners"), { ssr: false });

export const metadata: Metadata = {
  title: "Pricing | GYSM",
  description: "One simple plan for the GYSM AI website builder: €20 a month, cancel anytime.",
  alternates: { canonical: "/pricing" },
};

// Server Component reading straight from lib/stripe.ts PRICING_PLANS.
// Split into "pay as you go" (one_time) and "monthly" (month) sections to
// match the tiering in lib/stripe.ts, plus a hardcoded Enterprise card since
// Enterprise is a custom quote, not a purchasable Stripe Price.
export default function PricingPage() {
  const monthly = PRICING_PLANS.filter((p) => p.interval === "month" && !p.hidden);

  // Per-plan Offer structured data -- built straight from PRICING_PLANS
  // (never hardcoded numbers) so it can't go stale the way the homepage's
  // AggregateOffer JSON-LD did (shipped once as a hardcoded "9" that
  // silently outlived a full repricing to $1.99). This is what lets AI
  // answer engines and search rich results cite GYSM's actual current
  // price per plan instead of guessing from the rendered "$X.XX" text or
  // a stale cache. VOIIE's tiers are excluded (already filtered out via
  // !p.hidden above) since those are quoted 1:1 to specific leads, not a
  // self-serve price a crawler should tell a random reader about.
  const pricingJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "GYSM AI App Builder",
    description: "The GYSM monthly plan for the AI website builder.",
    brand: { "@type": "Brand", name: "GYSM" },
    offers: monthly.map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.price.toFixed(2),
      priceCurrency: p.currency.toUpperCase(),
      url: `${siteUrl}/pricing`,
      availability: "https://schema.org/InStock",
      description: p.description,
      ...(p.interval === "month"
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: p.price.toFixed(2), priceCurrency: p.currency.toUpperCase(), billingDuration: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } } }
        : {}),
    })),
  };

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }} />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM
          </a>
          <a href="/agent" className="text-[11px] opacity-50 hover:opacity-100">
            Back to builder
          </a>
        </div>

        <PricingBanners />

        <h1 className="text-4xl md:text-6xl font-black text-center tracking-tighter mb-3">
          One plan. Everything included.
        </h1>
        <p className="text-center opacity-50 mb-14">Build, preview and publish sites with the GYSM Agent. Cancel anytime.</p>

        <div className="grid md:grid-cols-3 gap-4 items-start">
          {monthly.map((plan) => (
            <div key={plan.id} className="md:col-span-2 rounded-3xl p-8 border bg-black text-white border-black">
              <div className="text-xs opacity-60 uppercase tracking-widest">{plan.name}</div>
              <div className="flex gap-1 items-baseline mt-2">
                <span className="text-6xl font-black">{formatPlanPrice(plan)}</span>
                <span className="text-sm opacity-60">/month</span>
              </div>
              <p className="mt-4 text-sm opacity-80">{plan.description}</p>
              <ul className="mt-5 space-y-2 text-sm opacity-90">
                <li>• The GYSM Agent: builds, edits and checks whole sites for you</li>
                <li>• Preview before anything goes live</li>
                <li>• Publish to your own name.gysm.io, with images and fonts</li>
                <li>• Shell and media tools included</li>
              </ul>
              <CheckoutButton planId={plan.id} label={`Subscribe for ${formatPlanPrice(plan)}/month`} highlight={false} />
            </div>
          ))}

          <div className="rounded-3xl p-6 border border-black/10 bg-white shadow-sm">
            <div className="text-xs opacity-50 uppercase tracking-widest">Enterprise</div>
            <div className="flex gap-1 items-baseline mt-2">
              <span className="text-4xl font-black">Custom</span>
            </div>
            <p className="mt-3 text-sm opacity-80">Higher limits, priority generation, SSO, and a dedicated account manager.</p>
            <a
              href="mailto:sales@gysm.io?subject=Enterprise%20plan"
              className="mt-4 block w-full rounded-full py-2.5 text-center text-sm font-semibold border border-black/15 hover:bg-black hover:text-white transition"
            >
              Contact sales
            </a>
          </div>
        </div>

        <div className="mt-14 max-w-3xl">
          <h2 className="text-sm uppercase tracking-widest opacity-50 mb-3">How usage works</h2>
          <p className="text-sm opacity-80 leading-relaxed">
            Your plan includes a usage allowance that refills every {PLAN_WINDOW_HOURS} hours: the window starts with your
            first request and resets {PLAN_WINDOW_HOURS} hours later. There is also a weekly limit, so the plan stays fast and
            fair for everyone. Small requests use a little; long Agent builds use more. If you reach a limit, you&apos;ll see
            exactly when it resets, and you can carry on then. Your usage is shown in Billing.
          </p>
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
