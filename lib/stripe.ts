import Stripe from "stripe";
// Import from credits-constants.ts (not credits.ts) -- this file is
// imported by client components (app/pricing/CheckoutButton.tsx), and
// credits.ts pulls in lib/db.ts, which throws at module-load time if
// DATABASE_URL isn't set. Since only NEXT_PUBLIC_* vars are ever inlined
// into client bundles, that throw would fire in every visitor's browser.
// credits-constants.ts has the same plan/build numbers with no db import.
import { CREDITS_PER_PLAN, BUILDS_PER_PLAN, BUILD_COST_USD, FLAT_PROFIT_USD } from "@/lib/credits-constants";

// Standard US Stripe card rate (2.9% + $0.30/transaction) -- stable,
// published pricing, not something that needed the same web research as
// the AI model rates above. Folded into every price below so the flat $1
// profit survives Stripe's own cut, not just the AI cost: charging
// (builds*BUILD_COST_USD.fast + FLAT_PROFIT_USD) and then having Stripe
// take a bite out of THAT would leave less than $1 net, silently. Applied
// once per Stripe transaction (a whole pack/plan purchase, or one month's
// subscription invoice) -- Stripe charges the fee on the transaction
// total, not per line item, which is also why FLAT_PROFIT_USD itself is
// added once per plan rather than once per build.
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_USD = 0.3;

/** Grosses up a target net amount (what GYSM should actually keep after
 *  Stripe's cut) into the sticker price that nets exactly that amount.
 *  Standard fee-inclusive-pricing algebra: if P is charged and Stripe
 *  takes `pct*P + fixed`, then P - (pct*P + fixed) = net  =>
 *  P = (net + fixed) / (1 - pct). Rounded up to the cent so GYSM never
 *  nets a fraction less than intended. */
function priceCoveringStripeFee(netTargetUsd: number): number {
  const gross = (netTargetUsd + STRIPE_FIXED_FEE_USD) / (1 - STRIPE_PERCENT_FEE);
  return Math.ceil(gross * 100) / 100;
}

/** Per Mike: every price tag should read as a "99" price (psychological
 *  pricing -- $4.99 not $4.23). Rounds UP to the nearest whole-dollar-99,
 *  never down, so the result still covers priceCoveringStripeFee's exact
 *  break-even-plus-profit target -- it can only pad the margin a little
 *  further, never erode it. $4.99 stays $4.99 (already there); $4.23,
 *  $5.00, and $5.98 all become $5.99. Computed in integer cents to avoid
 *  float-precision edge cases at the boundary. */
function roundUpToX99(usd: number): number {
  const cents = Math.round(usd * 100);
  const dollars = Math.max(0, Math.ceil((cents - 99) / 100));
  return dollars + 0.99;
}

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
 * app/api/billing/checkout/route.ts. Change prices here and the pricing
 * page updates -- but see the IMPORTANT note below, `price` here is
 * DISPLAY ONLY.
 *
 * Repriced Sep 2026 at real AI cost + a flat $1 profit, Stripe's own
 * processing fee included (see BUILD_COST_USD in lib/credits-constants.ts
 * for the AI cost model and its sourcing, and priceCoveringStripeFee above
 * for the fee math). Replaces the old volume-discount model (6-26x markup,
 * cheaper per-build the more you bought, based on a single stale
 * "~$0.07/build, GPT-4o + Gemini" estimate that didn't match the models
 * actually in use).
 *
 * IMPORTANT, corrected same day: the $1 is added ONCE PER PLAN, not once
 * per build in the plan. Every plan below is
 * `priceCoveringStripeFee(builds * BUILD_COST_USD.fast + FLAT_PROFIT_USD)`
 * -- exactly $1 of flat margin whether it's a 5-build pack or a 600-build
 * plan. An earlier version of this multiplied FLAT_PROFIT_USD by builds
 * (so Studio alone carried $600 of "flat $1" profit) -- Mike caught that
 * this wasn't what "put $1 as my profit" meant and corrected it to a
 * true flat $1 per price tag. Net effect vs. the old flat prices: PAYG
 * packs got much cheaper, and so did the subscriptions -- this pricing
 * model runs GYSM's builder plans at close to break-even (a few cents to
 * ~$1 total margin per pack/month), not a per-build profit center. That's
 * a deliberate, Mike-confirmed choice, not an oversight.
 *
 * Every price is then rounded UP to the nearest "99" ending (see
 * roundUpToX99 above) -- per Mike, so every price tag reads $X.99 instead
 * of an odd cost-derived amount like $4.23. This only ever pads the
 * margin a few cents further, never erodes the break-even-plus-profit
 * target above it.
 *
 * IMPORTANT: `price` below is what the /pricing page DISPLAYS. What
 * Stripe actually CHARGES at checkout is whatever amount the Price object
 * at `priceIdEnvVar` (in the Stripe Dashboard) was created with --
 * app/api/billing/checkout/route.ts passes that Price ID straight to
 * Stripe and never reads `price` at all. Updating the numbers here does
 * NOT change what customers get billed. Each priceIdEnvVar's Stripe Price
 * object needs to be recreated (Stripe Prices are immutable once created)
 * at the new amount, and the env var repointed at the new Price ID, or
 * this page will advertise one number and charge another.
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "credits_starter",
    name: "Starter Pack",
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.credits_starter * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
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
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.credits_popular * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
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
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.credits_bulk * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
    currency: "usd",
    interval: "one_time",
    credits: CREDITS_PER_PLAN.credits_bulk,
    builds: BUILDS_PER_PLAN.credits_bulk,
    description: "50 builds, no subscription.",
    tagline: "Stock up",
    priceIdEnvVar: "STRIPE_CREDITS_BULK_PRICE_ID",
  },
  {
    id: "plan_builder",
    name: "Builder",
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.plan_builder * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
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
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.plan_pro * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
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
    price: roundUpToX99(priceCoveringStripeFee(BUILDS_PER_PLAN.plan_studio * BUILD_COST_USD.fast + FLAT_PROFIT_USD)),
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
  //
  // NOT repriced to builds*BUILD_COST_USD.fast + FLAT_PROFIT_USD like the
  // plans above (that would round to $1.99/$2.99/$3.99 -- literally just
  // the welcome credit grant's raw AI cost + $1). Deliberately left at the
  // original $79/$199/$499 (now $79.99/$199.99/$499.99 after the .99
  // rounding pass below, same as every other plan): this price isn't
  // paying for N raw AI builds, it's
  // paying for a live, deployed, custom-domained website plus ongoing
  // support/repairs and the sales/outreach work that landed the lead in
  // the first place -- none of which has a $ cost anywhere in this
  // codebase to add $1 on top of. Pricing these at the bare AI-cost
  // number would guarantee a loss the moment a domain gets registered or
  // a support ticket gets answered -- and under the flat-$1-per-tag model
  // above it'd be an even steeper cut than under the old per-build one
  // (roughly 50x/96x/142x, not ~24x). Flagged to Mike rather than
  // silently slashing these -- if VOIIE's real all-in cost per site
  // (domain + support time + outreach cost) is ever tracked somewhere,
  // that's the number this should become cost-plus-$1 of, not the AI
  // cost alone.
  {
    id: "voiie_starter",
    name: "VOIIE Starter Site",
    price: roundUpToX99(79),
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
    price: roundUpToX99(199),
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
    price: roundUpToX99(499),
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

/**
 * Known-good live Stripe Price IDs, pulled straight from the Stripe
 * account right after the Sep 2026 repricing (the 9 Prices that are
 * actually `active: true` today). This is a SAFETY NET, not the primary
 * source of truth -- STRIPE_*_PRICE_ID env vars in Vercel (priceIdEnvVar
 * above) are still what's meant to drive checkout day to day, since
 * that's what lets a price change without a code deploy.
 *
 * It exists because that hand-maintained env var step already went stale
 * for real: right after repricing every plan and deactivating the old
 * Stripe Prices, one of the STRIPE_*_PRICE_ID vars in Vercel was left
 * pointing at a now-deactivated Price, and checkout started throwing
 * "The price specified is inactive" for every customer on that plan --
 * silently, until someone happened to try buying it. There's no tool
 * available in this workflow that can read or fix a Vercel env var
 * directly, so app/api/billing/checkout/route.ts now falls back to this
 * map (and loudly logs which env var was wrong) whenever Stripe rejects
 * the configured price as inactive/missing -- a stale env var degrades to
 * "checkout still works, log a warning" instead of "checkout is down for
 * that plan until a human notices."
 *
 * Keep this in sync whenever a plan's Stripe Price is recreated -- same
 * discipline the env vars already require, just with a safety net under
 * it now instead of a silent single point of failure.
 */
export const DEFAULT_LIVE_PRICE_IDS: Record<PricingPlan["id"], string> = {
  credits_starter: "price_1UByxVDE5QfMC9H1FKBdHVIk",
  credits_popular: "price_1UByxjDE5QfMC9H1Rc5Km9vo",
  credits_bulk: "price_1UByxlDE5QfMC9H1eQsGbept",
  plan_builder: "price_1UByxmDE5QfMC9H1h1uruCcC",
  plan_pro: "price_1UByxnDE5QfMC9H1G9POfwzL",
  plan_studio: "price_1UByxpDE5QfMC9H1HBSD1DIv",
  voiie_starter: "price_1UByxqDE5QfMC9H1nWSHLHQM",
  voiie_pro: "price_1UByxsDE5QfMC9H1vpBrUsdu",
  voiie_agency: "price_1UByxtDE5QfMC9H1srTxLqVX",
};

/** Reads the real Stripe Price ID for a plan: the Vercel env var if set,
 *  else the known-good default above (see DEFAULT_LIVE_PRICE_IDS). */
export function getPriceId(planId: string): string | undefined {
  const plan = getPlanById(planId);
  if (!plan) return undefined;
  return process.env[plan.priceIdEnvVar] || DEFAULT_LIVE_PRICE_IDS[plan.id];
}
