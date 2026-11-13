import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { formatMoney } from "@/lib/stores/core";
import { confirmBooking, expireBooking, getStoreById, markOrderExpired, markOrderPaid, setChargesEnabled } from "@/lib/stores/db";
import { notifyBooking, sellerEmail } from "@/lib/stores/notify";
import { storeDb } from "@/lib/stores/connections";
import { sendStoreOrderEmail } from "@/lib/email/send";

export const runtime = "nodejs";

// Stripe Connect events from sellers' own accounts (GYSM Stores). Register a
// *Connect* webhook endpoint in Stripe (Developers -> Webhooks -> "Events on
// connected accounts") pointing at /api/webhooks/stripe-connect with:
// checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.expired, account.updated. Its signing secret goes in
// STRIPE_CONNECT_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch (err: any) {
    console.error("[stripe-connect] signature verification failed:", err?.message || err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        await setChargesEnabled(account.id, Boolean(account.charges_enabled));
        break;
      }
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status !== "paid") break;
        if (session.metadata?.source === "gysm_store") await handlePaid(event.account ?? null, session);
        else if (session.metadata?.source === "gysm_booking") await handleBookingPaid(event.account ?? null, session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const source = session.metadata?.source;
        if (source !== "gysm_store" && source !== "gysm_booking") break;
        const store = await getStoreById(session.metadata?.storeId ?? "");
        if (!store || store.stripe_account_id !== event.account) break;
        const db = await storeDb(store);
        if (source === "gysm_store") await markOrderExpired(db, session.metadata?.orderId ?? "");
        else await expireBooking(db, session.metadata?.bookingId ?? "");
        break;
      }
    }
  } catch (e: any) {
    // A 500 makes Stripe retry later, which is what we want for a transient database error.
    console.error(`[stripe-connect] ${event.type} failed:`, e?.message || e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handlePaid(accountId: string | null, session: Stripe.Checkout.Session) {
  const store = await getStoreById(session.metadata?.storeId ?? "");
  // The event must come from the account this store is connected to.
  if (!store || !accountId || store.stripe_account_id !== accountId) {
    console.error("[stripe-connect] paid session for unknown store/account", { storeId: session.metadata?.storeId, accountId });
    return;
  }
  const details = session.customer_details;
  const shippingDetails = (session as any).collected_information?.shipping_details ?? (session as any).shipping_details ?? null;
  const order = await markOrderPaid(await storeDb(store), session.metadata?.orderId ?? "", session.id, {
    amountTotalCents: session.amount_total ?? null,
    email: details?.email ?? null,
    name: details?.name ?? null,
    shipping: shippingDetails,
  });
  if (!order) return; // already handled (Stripe can deliver an event twice)

  const to = await sellerEmail(store);
  if (!to) return;
  const addr = shippingDetails?.address;
  const shipping = addr
    ? [shippingDetails?.name, addr.line1, addr.line2, [addr.postal_code, addr.city].filter(Boolean).join(" "), addr.state, addr.country].filter(Boolean).join(", ")
    : null;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io").replace(/\/+$/, "");
  await sendStoreOrderEmail(to, {
    storeName: store.name,
    total: formatMoney(order.amount_total_cents, order.currency),
    lines: (order.items ?? []).map((i) => `${i.quantity} x ${i.name} (${formatMoney(i.unit_price_cents, order.currency)})`),
    customer: order.customer_name || order.customer_email || "A customer",
    shipping,
    dashboardUrl: `${site}/agent`,
  });
}

async function handleBookingPaid(accountId: string | null, session: Stripe.Checkout.Session) {
  const store = await getStoreById(session.metadata?.storeId ?? "");
  if (!store || !accountId || store.stripe_account_id !== accountId) {
    console.error("[stripe-connect] paid booking for unknown store/account", { storeId: session.metadata?.storeId, accountId });
    return;
  }
  const booking = await confirmBooking(await storeDb(store), session.metadata?.bookingId ?? "", session.id);
  if (booking) await notifyBooking(store, booking); // null = already confirmed (duplicate event)
}
