/**
 * Apple App Store In-App Purchase support (Guideline 3.1.1).
 *
 * GYSM's web checkout (lib/stripe.ts, app/api/billing/checkout) charges
 * cards directly via Stripe. Apple does not allow that inside a native
 * iOS app for digital goods/subscriptions -- purchases made from within
 * the iOS app must go through StoreKit, so this module is a parallel rail
 * that reuses the exact same plan catalog (credits, price, builds) but
 * settles through RevenueCat -> StoreKit instead of Stripe.
 *
 * Web users are completely unaffected: this only activates when the app
 * is running inside the native iOS shell (Capacitor.isNativePlatform()).
 *
 * Product IDs below must be created in App Store Connect
 * (Monetization -> In-App Purchases) with matching IDs and prices, then
 * mapped to the same identifiers in the RevenueCat dashboard as an
 * Offering called "default" with one Package per plan. Both of those are
 * dashboard/account steps that need your Apple Developer + RevenueCat
 * logins -- not something doable from here.
 */

import { PRICING_PLANS, type PricingPlan } from "@/lib/stripe";

// Reverse-DNS product IDs, namespaced under the app's bundle ID
// (io.gysm.app, set in capacitor.config.ts) per App Store Connect
// convention. One-time packs are "consumable", monthly plans are
// "auto-renewable subscriptions" in App Store Connect's product type.
export const IAP_PRODUCT_IDS: Record<PricingPlan["id"], string> = {
  credits_starter: "io.gysm.app.credits_starter",
  credits_popular: "io.gysm.app.credits_popular",
  credits_bulk: "io.gysm.app.credits_bulk",
  plan_builder: "io.gysm.app.plan_builder.monthly",
  plan_pro: "io.gysm.app.plan_pro.monthly",
  plan_studio: "io.gysm.app.plan_studio.monthly",
  // VOIIE plans (lib/stripe.ts) are quoted and paid for a hunted lead
  // from the /voiie dashboard's web checkout flow only -- there's no
  // native-app surface that sells them, so no real product IDs exist for
  // these in App Store Connect. Present so this Record type-checks
  // against PricingPlan["id"]; getPlanByIapProductId simply never
  // resolves them since no StoreKit purchase will ever carry these ids.
  voiie_starter: "io.gysm.app.voiie_starter.unused",
  voiie_pro: "io.gysm.app.voiie_pro.unused",
  voiie_agency: "io.gysm.app.voiie_agency.unused",
};

export function getPlanByIapProductId(productId: string): PricingPlan | undefined {
  const planId = (Object.entries(IAP_PRODUCT_IDS).find(
    ([, pid]) => pid === productId
  ) ?? [])[0];
  return PRICING_PLANS.find((p) => p.id === planId);
}

export const REVENUECAT_IOS_API_KEY_ENV = "NEXT_PUBLIC_REVENUECAT_IOS_API_KEY";
