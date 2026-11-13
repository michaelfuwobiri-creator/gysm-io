import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { sql } from "@/lib/db";
import { formatMoney } from "@/lib/stores/core";
import { getStoreById, markOrderExpired, markOrderPaid, setChargesEnabled } from "@/lib/stores/db";
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
        if (session.metadata?.source !== "gysm_store" || session.payment_status !== "paid") break;
        await handlePaid(event.account ?? null, session);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source !== "gysm_store") break;
        const store = await getStoreById(session.metadata.storeId ?? "");
        if (!store || store.stripe_account_id !== event.account) break;
        await markOrderExpired(await storeDb(store), session.metadata.orderId ?? "");
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

  const to = store.notify_email || (await ownerEmail(store.user_id));
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

async function ownerEmail(userId: string): Promise<string | null> {
  try {
    const rows = await sql`select email from users where clerk_id = ${userId} limit 1`;
    return ((rows[0] as any)?.email as string) ?? null;
  } catch {
    return null;
  }
}
