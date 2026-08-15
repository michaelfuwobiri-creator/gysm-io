"use client";

/**
 * Client-side native purchase flow. Only ever imported/executed from
 * CheckoutButton.tsx, and only takes this path when
 * Capacitor.isNativePlatform() is true (i.e. running inside the iOS app
 * shell) -- web visitors keep using the existing Stripe redirect in
 * app/api/billing/checkout.
 */

import { IAP_PRODUCT_IDS, REVENUECAT_IOS_API_KEY_ENV } from "@/lib/iap";
import type { PricingPlan } from "@/lib/stripe";

let configured = false;

async function ensureConfigured(appUserId: string) {
  const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
  if (configured) return Purchases;

  const apiKey = process.env[REVENUECAT_IOS_API_KEY_ENV];
  if (!apiKey) {
    throw new Error(
      `Missing ${REVENUECAT_IOS_API_KEY_ENV}. Set it in Vercel env vars from the RevenueCat dashboard (Project settings -> API keys -> Apple App Store).`
    );
  }

  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  // appUserId ties the RevenueCat purchaser identity to GYSM's own Clerk
  // user id, so the iap-webhook can credit the right account without a
  // separate mapping table.
  await Purchases.configure({ apiKey, appUserID: appUserId });
  configured = true;
  return Purchases;
}

export async function isNativeIOSApp(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/**
 * Buys the given plan via StoreKit through RevenueCat. Resolves once the
 * purchase completes locally; the actual credit grant happens
 * server-side when RevenueCat calls /api/billing/iap-webhook, same
 * two-step pattern as the Stripe flow (checkout -> webhook).
 */
export async function purchasePlanNative(plan: PricingPlan, clerkUserId: string) {
  const Purchases = await ensureConfigured(clerkUserId);
  const productId = IAP_PRODUCT_IDS[plan.id];

  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find(
    (p) => p.product.identifier === productId
  );

  if (!pkg) {
    throw new Error(
      `No StoreKit product found for "${productId}". Check that it's approved in App Store Connect and mapped into the RevenueCat "default" offering.`
    );
  }

  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}
