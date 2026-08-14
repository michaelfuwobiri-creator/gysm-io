import Stripe from "stripe";
import { CREDITS_PER_PLAN, BUILDS_PER_PLAN } from "@/lib/credits";

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
  id: "credits_starter" | "credits_popular" | "credits_bulk" | "plan_builder" | "plan_pro" | "plan_studio";
  name: string;
  price: number;
  currency: "usd";
  /** 'month' = recurring subscription. 'one_time' = single Checkout payment. */
  interval: "month" | "one_time";
  credits: number;
  builds: number;
  description: string;
  highlight?: boolean;
  /** Name of the Vercel env var holding the real Stripe Price ID for this plan. */
  priceIdEnvVar: string;
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
    priceIdEnvVar: "STRIPE_PLAN_STUDIO_PRICE_ID",
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
