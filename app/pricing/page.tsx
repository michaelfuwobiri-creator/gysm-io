import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PRICING_PLANS } from "@/lib/stripe";
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
  title: "Pricing | GYSM.IO",
  description: "Simple, transparent pricing for the GYSM.IO AI website builder — pay as you go or subscribe monthly.",
};

// Server Component reading straight from lib/stripe.ts PRICING_PLANS.
// Split into "pay as you go" (one_time) and "monthly" (month) sections to
// match the tiering in lib/stripe.ts, plus a hardcoded Enterprise card since
// Enterprise is a custom quote, not a purchasable Stripe Price.
export default function PricingPage() {
  const payAsYouGo = PRICING_PLANS.filter((p) => p.interval === "one_time" && !p.hidden);
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
    name: "GYSM.IO AI App Builder",
    description: "AI website/app builder credit packs and subscription plans.",
    brand: { "@type": "Brand", name: "GYSM.IO" },
    offers: [...payAsYouGo, ...monthly].map((p) => ({
      "@type": "Offer",
      name: p.name,
      price: p.price.toFixed(2),
      priceCurrency: "USD",
      url: `${siteUrl}/pricing`,
      availability: "https://schema.org/InStock",
      description: p.description,
      ...(p.interval === "month"
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: p.price.toFixed(2), priceCurrency: "USD", billingDuration: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } } }
        : {}),
    })),
  };

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }} />
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="text-[#FF0080]">.IO</span>
          </a>
          <a href="/builder" className="text-[11px] opacity-50 hover:opacity-100">
            Back to builder
          </a>
        </div>

        <PricingBanners />

        <h1 className="text-4xl md:text-6xl font-black text-center tracking-tighter mb-3">
          Simple pricing
        </h1>
        <p className="text-center opacity-50 mb-16">No subscription required. Pay per pack, or subscribe monthly and save.</p>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm uppercase tracking-widest opacity-50">Pay as you go</h2>
          <span className="text-xs opacity-40">Credits never expire</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mb-16">
          {payAsYouGo.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-6 border ${
                plan.highlight ? "bg-black text-white border-black" : "bg-white border-black/10 shadow-sm"
              }`}
            >
              <div className="text-xs opacity-50 uppercase tracking-widest">{plan.name}</div>
              <div className="flex gap-1 items-baseline mt-2">
                {/* toFixed(2) -- prices are real cost + a flat $1 now (see
                    lib/stripe.ts), so they're no longer always whole
                    dollars (e.g. $43.60), unlike the old flat round
                    numbers. */}
                <span className="text-4xl font-black">${plan.price.toFixed(2)}</span>
              </div>
              <p className="mt-3 text-sm opacity-80">{plan.description}</p>
              <p className="mt-1 text-xs opacity-50">{plan.tagline}</p>
              <CheckoutButton planId={plan.id} label={`Get ${plan.name}`} highlight={plan.highlight} />
            </div>
          ))}
        </div>

        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm uppercase tracking-widest opacity-50">Monthly subscriptions</h2>
          <span className="text-xs opacity-40">Cancel anytime</span>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {monthly.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-6 border ${
                plan.highlight ? "bg-black text-white border-black" : "bg-white border-black/10 shadow-sm"
              }`}
            >
              <div className="text-xs opacity-50 uppercase tracking-widest">{plan.name}</div>
              <div className="flex gap-1 items-baseline mt-2">
                {/* toFixed(2) -- prices are real cost + a flat $1 now (see
                    lib/stripe.ts), so they're no longer always whole
                    dollars (e.g. $43.60), unlike the old flat round
                    numbers. */}
                <span className="text-4xl font-black">${plan.price.toFixed(2)}</span>
                <span className="text-sm opacity-60">/mo</span>
              </div>
              <p className="mt-3 text-sm opacity-80">{plan.description}</p>
              <p className="mt-1 text-xs opacity-50">{plan.tagline}</p>
              <CheckoutButton planId={plan.id} label={`Get ${plan.name}`} highlight={plan.highlight} />
            </div>
          ))}

          <div className="rounded-3xl p-6 border border-black/10 bg-white shadow-sm">
            <div className="text-xs opacity-50 uppercase tracking-widest">Enterprise</div>
            <div className="flex gap-1 items-baseline mt-2">
              <span className="text-4xl font-black">Custom</span>
            </div>
            <p className="mt-3 text-sm opacity-80">Unlimited builds, priority generation, SSO, and a dedicated account manager.</p>
            <p className="mt-1 text-xs opacity-50">Starting around $999/mo</p>
            <a
              href="mailto:sales@gysm.io?subject=Enterprise%20plan"
              className="mt-4 block w-full rounded-full py-2.5 text-center text-sm font-semibold border border-black/15 hover:bg-black hover:text-white transition"
            >
              Contact sales
            </a>
          </div>
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
