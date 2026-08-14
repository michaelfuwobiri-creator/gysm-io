import Stripe from "stripe";
import { CREDITS_PER_PLAN } from "@/lib/credits";

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
  id: "starter" | "agency" | "credits_10" | "credits_30";
  name: string;
  price: number;
  currency: "eur";
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
 */
export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 29,
    currency: "eur",
    interval: "month",
    credits: CREDITS_PER_PLAN.starter,
    builds: 30,
    description: "1 Pro SaaS a month -- a complete working product, not just code.",
    highlight: true,
    priceIdEnvVar: "STRIPE_STARTER_PRICE_ID",
  },
  {
    id: "agency",
    name: "Agency",
    price: 300,
    currency: "eur",
    interval: "month",
    credits: CREDITS_PER_PLAN.agency,
    builds: 300,
    description: "Unlimited client SaaS factory. Fair use: 300 builds/mo.",
    priceIdEnvVar: "STRIPE_AGENCY_PRICE_ID",
  },
  {
    id: "credits_10",
    name: "10 Credits Pack",
    price: 10,
    currency: "eur",
    interval: "one_time",
    credits: 5000,
    builds: 10,
    description: "Pay as you go. 10 builds, no subscription.",
    priceIdEnvVar: "STRIPE_CREDITS_10_PRICE_ID",
  },
  {
    id: "credits_30",
    name: "30 Credits Pack",
    price: 25,
    currency: "eur",
    interval: "one_time",
    credits: 15000,
    builds: 30,
    description: "Pay as you go. 30 builds, no subscription.",
    priceIdEnvVar: "STRIPE_CREDITS_30_PRICE_ID",
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
