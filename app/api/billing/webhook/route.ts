import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, getPlanById } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { addCredits } from "@/lib/credits";

export const runtime = "nodejs";

// Previously this verified the Stripe signature correctly but then did
// nothing except console.log("PAYMENT OK", ...) -- a real payment would
// succeed in Stripe and the user would receive zero credits. This is the fix.
//
// IMPORTANT (can't be done from here -- needs to be checked in the Stripe
// Dashboard): make sure the webhook endpoint registered under Developers ->
// Webhooks points at /api/billing/webhook, not /api/stripe/webhook (that
// second route was a stub that returned 200 for literally anything without
// checking the signature -- it's been removed in this pass).
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("[billing/webhook] signature verification failed:", err?.message || err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const planId = session.metadata?.planId;
        const plan = getPlanById(planId);

        if (!userId || !plan) {
          console.error("[billing/webhook] checkout.session.completed missing userId/plan", {
            userId,
            planId,
          });
          break;
        }

        await addCredits(userId, plan.credits);

        if (plan.interval === "month" && session.subscription) {
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: (session.customer as string) ?? null,
              stripe_subscription_id: session.subscription as string,
              plan: plan.id,
              status: "active",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        }
        break;
      }

      // Monthly renewal on an existing subscription -> top up credits again.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as any).subscription as string | null;
        if (!subId) break;

        const { data: sub } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (sub) {
          const plan = getPlanById(sub.plan);
          if (plan) {
            await addCredits(sub.user_id, plan.credits);
          }
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: sub.status, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    // Signature is already verified at this point, so a failure here is OUR
    // bug (e.g. Supabase unreachable), not a forged request. Return 500 so
    // Stripe retries with backoff instead of silently dropping the credit.
    console.error("[billing/webhook] handler error:", err?.message || err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const dynamic = 'force-dynamic'

