// GYSM Stores payments: Stripe Connect with Standard accounts and direct
// charges. Each seller owns their Stripe account; the customer pays the seller
// and GYSM never holds the money. Needs Connect enabled on GYSM's Stripe
// platform account.
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { storeUrl, type CartLine } from "./core";
import { setChargesEnabled, setStoreStripeAccount, type BookingRow, type StoreRow } from "./db";

/** Countries a store can ship to at checkout (Stripe needs an explicit list). */
export const SHIPPING_COUNTRIES = [
  "IT", "DE", "FR", "ES", "PT", "NL", "BE", "LU", "AT", "IE", "FI", "SE", "DK", "PL", "CZ", "SK", "SI", "HR",
  "HU", "RO", "BG", "GR", "CY", "MT", "EE", "LV", "LT", "GB", "CH", "NO", "US", "CA", "AU", "NG", "KE",
] as const;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io").replace(/\/+$/, "");
}

/** Creates the seller's Stripe account on first use and returns a link to Stripe's own onboarding. */
export async function stripeOnboardingLink(store: StoreRow, email: string | null): Promise<string> {
  const stripe = getStripe();
  let accountId = store.stripe_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      ...(email ? { email } : {}),
      business_profile: { name: store.name, url: storeUrl(store.slug) },
      metadata: { gysmStoreId: store.id },
    });
    accountId = account.id;
    await setStoreStripeAccount(store.id, store.user_id, accountId);
  }
  // Stripe sends the seller back here; both routes land them in the builder agent.
  const back = `${siteUrl()}/api/stores/${store.id}/stripe`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${back}/refresh`,
    return_url: `${back}/return`,
  });
  return link.url;
}

/** Re-reads the account from Stripe and stores whether it can take payments. */
export async function refreshStripeStatus(accountId: string): Promise<boolean> {
  const account = await getStripe().accounts.retrieve(accountId);
  const enabled = Boolean(account.charges_enabled);
  await setChargesEnabled(accountId, enabled);
  return enabled;
}

/** Platform fee in cents from STORES_APPLICATION_FEE_BPS (basis points, default 0 = no fee). */
export function applicationFeeCents(totalCents: number, env: Record<string, string | undefined> = process.env): number {
  const bps = Number(env.STORES_APPLICATION_FEE_BPS ?? 0);
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.floor((totalCents * Math.min(bps, 2000)) / 10000);
}

/** A Checkout Session on the seller's own Stripe account for an already-recorded pending order. */
export async function createStoreCheckout(store: StoreRow, orderId: string, lines: CartLine[], totalCents: number): Promise<Stripe.Checkout.Session> {
  if (!store.stripe_account_id) throw new Error("Store has no Stripe account");
  const base = storeUrl(store.slug);
  const fee = applicationFeeCents(totalCents);
  const metadata = { source: "gysm_store", storeId: store.id, orderId };
  return getStripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: store.currency,
          unit_amount: l.product.price_cents,
          product_data: { name: l.product.name, ...(l.product.image_url ? { images: [l.product.image_url] } : {}) },
        },
      })),
      client_reference_id: orderId,
      metadata,
      payment_intent_data: { metadata, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
      ...(store.collect_shipping ? { shipping_address_collection: { allowed_countries: [...SHIPPING_COUNTRIES] } } : {}),
      success_url: `${base}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: base,
    },
    { stripeAccount: store.stripe_account_id },
  );
}

/** A Checkout Session on the seller's own Stripe account for a paid booking (held for 30 minutes). */
export async function createBookingCheckout(store: StoreRow, booking: BookingRow, when: string): Promise<Stripe.Checkout.Session> {
  if (!store.stripe_account_id) throw new Error("Store has no Stripe account");
  const base = storeUrl(store.slug);
  const fee = applicationFeeCents(booking.amount_cents);
  const metadata = { source: "gysm_booking", storeId: store.id, bookingId: booking.id };
  return getStripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: booking.customer_email,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: store.currency, unit_amount: booking.amount_cents, product_data: { name: `${booking.service_name} (${when})` } },
        },
      ],
      client_reference_id: booking.id,
      metadata,
      payment_intent_data: { metadata, ...(fee > 0 ? { application_fee_amount: fee } : {}) },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${base}/thanks?booked=1`,
      cancel_url: base,
    },
    { stripeAccount: store.stripe_account_id },
  );
}
