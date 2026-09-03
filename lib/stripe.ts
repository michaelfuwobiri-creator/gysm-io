import Stripe from "stripe";
// Import from credits-constants.ts (not credits.ts) -- this file is
// imported by client components (app/pricing/CheckoutButton.tsx), and
// credits.ts pulls in lib/db.ts, which throws at module-load time if
// DATABASE_URL isn't set. Since only NEXT_PUBLIC_* vars are ever inlined
// into client bundles, that throw would fire in every visitor's browser.
// credits-constants.ts has the same plan/build numbers with no db import.
import { CREDITS_PER_PLAN, BUILDS_PER_PLAN } from "@/lib/credits-constants";

let _stripe: Stripe | null = null;

/**
 * Lazily creates the Stripe client on first use instead of throwing at
 * import time. This file also exports PRICING_PLANS, which pages like
 * app/pricing/page.tsx import just to render prices -- those shouldn't 500
 * the whole page because STRIPE_SECRET_KEY happens to be unset in this
 * environment. Only actual checkout/webhook calls need the key, so only
 * they should fail if it's missing.
 */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Set it in Vercel -> Project -> Settings -> Environment Variables."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-07-29.dahlia",
    });
  }
  return _stripe;
}

export type PricingPlan = {
  id:
    | "credits_starter"
    | "credits_popular"
    | "credits_bulk"
    | "plan_builder"
    | "plan_pro"
    | "plan_studio"
    | "voiie_starter"
    | "voiie_pro"
    | "voiie_agency";
  name: string;
  price: number;
  currency: "usd";
  /** 'month' = recurring subscription. 'one_time' = single Checkout payment. */
  interval: "month" | "one_time";
  credits: number;
  builds: number;
  description: string;
  /** Short catchy line shown under the price on the pricing page instead
   *  of the raw builds/$-per-build math -- see app/pricing/page.tsx. */
  tagline: string;
  highlight?: boolean;
  /** Name of the Vercel env var holding the real Stripe Price ID for this plan. */
  priceIdEnvVar: string;
  /** True for a plan that's real (checkoutable, in PRICING_PLANS) but
   *  never shown on the public /pricing page -- currently just the VOIIE
   *  tiers, which are quoted 1:1 to a specific hunted lead by
   *  lib/voiie/billing.ts, not something a random visitor should be able
   *  to self-serve buy. */
  hidden?: boolean;
};

/**
 * Single source of truth for pricing, consumed by app/pricing/page.tsx and
 * app/api/billing/checkout/route.ts. Change prices here and both the
 * pricing page and checkout stay in sync.
 *
 * Priced at roughly 6-26x the actual AI cost per build (~$0.07 -- GPT-4o
 * structure pass + Gemini design pass), floored so every tier clears at
 * least a 500% margin even at its cheapest per-build price (Studio, the
 * highest-volume subscription, is the floor at 6x). PAYG is priced highest
 * per-build on purpose -- it's the no-commitment option -- and each
 * subscription tier gets cheaper per-build as volume goes up, to pull
 * usage toward recurring revenue.
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "credits_starter",
    name: "Starter Pack",
    price: 9,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.credits_starter,
    builds: BUILDS_PER_PLAN.credits_starter,
    description: "Try it out. 5 builds, no subscription.",
    tagline: "Just enough to try it",
    priceIdEnvVar: "STRIPE_CREDITS_STARTER_PRICE_ID",
  },
  {
    id: "credits_popular",
    name: "Popular Pack",
    price: 29,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.credits_popular,
    builds: BUILDS_PER_PLAN.credits_popular,
    description: "Pay as you go. 20 builds, no subscription.",
    tagline: "The sweet spot",
    highlight: true,
    priceIdEnvVar: "STRIPE_CREDITS_POPULAR_PRICE_ID",
  },
  {
    id: "credits_bulk",
    name: "Bulk Pack",
    price: 59,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.credits_bulk,
    builds: BUILDS_PER_PLAN.credits_bulk,
    description: "Best per-build rate without a subscription. 50 builds.",
    tagline: "Stock up and save",
    priceIdEnvVar: "STRIPE_CREDITS_BULK_PRICE_ID",
  },
  {
    id: "plan_builder",
    name: "Builder",
    price: 29,
    currency: "usd",
    interval: "month",
    credits: CREDITS_PER_PLAN.plan_builder,
    builds: BUILDS_PER_PLAN.plan_builder,
    description: "For solo builders shipping side projects. 40 builds/mo.",
    tagline: "For your next side project",
    priceIdEnvVar: "STRIPE_PLAN_BUILDER_PRICE_ID",
  },
  {
    id: "plan_pro",
    name: "Pro",
    price: 79,
    currency: "usd",
    interval: "month",
    credits: CREDITS_PER_PLAN.plan_pro,
    builds: BUILDS_PER_PLAN.plan_pro,
    description: "For freelancers running client work. 150 builds/mo.",
    tagline: "Built for freelance work",
    highlight: true,
    priceIdEnvVar: "STRIPE_PLAN_PRO_PRICE_ID",
  },
  {
    id: "plan_studio",
    name: "Studio",
    price: 249,
    currency: "usd",
    interval: "month",
    credits: CREDITS_PER_PLAN.plan_studio,
    builds: BUILDS_PER_PLAN.plan_studio,
    description: "For agencies shipping at scale. 600 builds/mo.",
    tagline: "Ship without limits",
    priceIdEnvVar: "STRIPE_PLAN_STUDIO_PRICE_ID",
  },
  // VOIIE plans -- one-time payment a hunted lead makes to take their
  // free demo (see lib/voiie/demo.ts) live for real. Not shown on
  // /pricing (hidden: true) -- lib/voiie/billing.ts's checkout route is
  // the only place that reads these, quoted to one specific lead at a
  // time by whoever's running VOIIE. Paying converts the lead into a
  // real GYSM.IO account that owns the build (see convertLeadToCustomer
  // in lib/voiie/billing.ts and the checkout.session.completed handler
  // in app/api/billing/webhook/route.ts).
  {
    id: "voiie_starter",
    name: "VOIIE Starter Site",
    price: 79,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.voiie_starter,
    builds: BUILDS_PER_PLAN.voiie_starter,
    description: "Your free demo, live on the web with your own account to manage it.",
    tagline: "Get online",
    priceIdEnvVar: "STRIPE_VOIIE_STARTER_PRICE_ID",
    hidden: true,
  },
  {
    id: "voiie_pro",
    name: "VOIIE Pro Site",
    price: 199,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.voiie_pro,
    builds: BUILDS_PER_PLAN.voiie_pro,
    description: "Your site live, plus a custom domain and priority repairs/upgrades.",
    tagline: "Get online, on your domain",
    priceIdEnvVar: "STRIPE_VOIIE_PRO_PRICE_ID",
    hidden: true,
  },
  {
    id: "voiie_agency",
    name: "VOIIE Agency Site",
    price: 499,
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.voiie_agency,
    builds: BUILDS_PER_PLAN.voiie_agency,
    description: "Full build-out with custom domain, ongoing renewals, and hands-on support.",
    tagline: "Done for you, fully managed",
    priceIdEnvVar: "STRIPE_VOIIE_AGENCY_PRICE_ID",
    hidden: true,
  },
];

export function getPlanById(planId: string | undefined | null): PricingPlan | undefined {
  return PRICING_PLANS.find((p) => p.id === planId);
}

/** Reads the real Stripe Price ID for a plan out of its configured env var. */
export function getPriceId(planId: string): string | undefined {
  const plan = getPlanById(planId);
  if (!plan) return undefined;
  return process.env[plan.priceIdEnvVar];
}
