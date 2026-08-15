import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { addCredits } from "@/lib/credits";
import { getPlanByIapProductId } from "@/lib/iap";

export const runtime = "nodejs";

// RevenueCat webhook receiver for App Store purchases made inside the iOS
// app (parallel rail to app/api/billing/webhook/route.ts, which handles
// Stripe on web). Configure this URL in the RevenueCat dashboard under
// Project settings -> Integrations -> Webhooks, with the same secret set
// below as an Authorization header -- that's a dashboard step that needs
// your RevenueCat login, not something doable from here.
//
// RevenueCat's app_user_id is set to the Clerk user id at purchase time
// (see lib/iap-client.ts Purchases.configure({ appUserID: clerkUserId })),
// so crediting the right account doesn't need a separate id-mapping table.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    console.error("[billing/iap-webhook] missing/invalid Authorization header");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload?.event;
  if (!event) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  const userId: string | undefined = event.app_user_id;
  const productId: string | undefined = event.product_id;
  const eventType: string | undefined = event.type;

  if (!userId || !productId) {
    console.error("[billing/iap-webhook] event missing app_user_id/product_id", { eventType });
    return NextResponse.json({ received: true });
  }

  const plan = getPlanByIapProductId(productId);
  if (!plan) {
    console.error("[billing/iap-webhook] no plan mapped for product", { productId });
    return NextResponse.json({ received: true });
  }

  try {
    switch (eventType) {
      // First purchase of a consumable pack, or a subscription's first period.
      case "INITIAL_PURCHASE":
      case "NON_RENEWING_PURCHASE":
        await addCredits(userId, plan.credits);
        if (plan.interval === "month") {
          await sql`
            insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, updated_at)
            values (${userId}, null, ${"rc:" + (event.original_transaction_id ?? productId)}, ${plan.id}, 'active', now())
            on conflict (user_id) do update set
              plan = excluded.plan,
              status = excluded.status,
              updated_at = now()
          `;
        }
        break;

      // Subscription renewed for another period -> top up credits again,
      // same as the Stripe invoice.paid case.
      case "RENEWAL":
        await addCredits(userId, plan.credits);
        await sql`
          update subscriptions set status = 'active', updated_at = now() where user_id = ${userId}
        `;
        break;

      case "CANCELLATION":
      case "EXPIRATION":
        await sql`
          update subscriptions set status = 'canceled', updated_at = now() where user_id = ${userId}
        `;
        break;

      default:
        // BILLING_ISSUE, PRODUCT_CHANGE, TRANSFER, etc. -- no credit action needed.
        break;
    }
  } catch (err: any) {
    console.error("[billing/iap-webhook] handler error:", err?.message || err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
