import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getPlanById } from "@/lib/stripe";
import { sql } from "@/lib/db";
import { addCredits } from "@/lib/credits";
import { convertLeadToCustomer } from "@/lib/voiie/billing";
import { markRenewalStatus } from "@/lib/voiie/db";
import { sendPaymentFailedEmail } from "@/lib/email/send";

export const runtime = "nodejs";

// Verifies the Stripe signature, then credits the right user in Neon.
//
// IMPORTANT (can't be done from here -- needs to be checked in the Stripe
// Dashboard): make sure the webhook endpoint registered under Developers ->
// Webhooks points at /api/billing/webhook, not /api/stripe/webhook (that
// second route was a stub that returned 200 for literally anything without
// checking the signature -- it's been removed).
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("[billing/webhook] signature verification failed:", err?.message || err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // VOIIE-sourced payment (see lib/voiie/billing.ts
        // createVoiieCheckoutSession): distinguished by metadata.source
        // rather than client_reference_id/userId, because there's no
        // signed-in gysm.io user on this path yet -- the whole point of
        // this branch is to create one. Handled separately from, not
        // alongside, the normal credit-grant path below: a VOIIE
        // conversion creates its account and transfers a project instead
        // of crediting an already-known userId.
        if (session.metadata?.source === "voiie") {
          const leadId = session.metadata.leadId;
          const planId = session.metadata.planId;
          const email = session.customer_email || session.customer_details?.email;
          if (!leadId || !planId || !email) {
            console.error("[billing/webhook] voiie checkout.session.completed missing leadId/planId/email", {
              leadId,
              planId,
              email,
            });
            break;
          }
          await convertLeadToCustomer(leadId, planId, email);
          break;
        }

        // VOIIE renewal/repair/upgrade/add-feature charge (see
        // lib/voiie/billing.ts createRenewalCheckoutLink) -- a returning
        // customer paying an ad-hoc amount, not a new conversion.
        if (session.metadata?.source === "voiie_renewal") {
          const renewalId = session.metadata.renewalId;
          if (!renewalId) {
            console.error("[billing/webhook] voiie_renewal checkout.session.completed missing renewalId");
            break;
          }
          await markRenewalStatus(renewalId, "paid", session.id);
          break;
        }

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
          await sql`
            insert into subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, updated_at)
            values (${userId}, ${(session.customer as string) ?? null}, ${session.subscription as string}, ${plan.id}, 'active', now())
            on conflict (user_id) do update set
              stripe_customer_id = excluded.stripe_customer_id,
              stripe_subscription_id = excluded.stripe_subscription_id,
              plan = excluded.plan,
              status = excluded.status,
              updated_at = now()
          `;
        }
        break;
      }

      // Monthly renewal on an existing subscription -> top up credits again.
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Stripe moved this field on newer API versions: it used to be
        // invoice.subscription directly, now it's nested under
        // invoice.parent.subscription_details.subscription. Reading only
        // the old path (as this used to) means subId is always undefined
        // on this app's pinned API version (2026-07-29.dahlia) and this
        // case silently no-ops on every renewal -- no credits, no error,
        // nothing in the logs. Check both so it works regardless of which
        // shape Stripe sends.
        const subId =
          ((invoice as any).subscription as string | null) ??
          ((invoice as any).parent?.subscription_details?.subscription as string | null) ??
          null;
        if (!subId) {
          console.error("[billing/webhook] invoice.paid had no subscription id", { invoiceId: invoice.id });
          break;
        }

        const rows = await sql`
          select user_id, plan from subscriptions where stripe_subscription_id = ${subId}
        `;
        const sub = rows[0] as { user_id: string; plan: string } | undefined;

        if (sub) {
          const plan = getPlanById(sub.plan);
          if (plan) {
            await addCredits(sub.user_id, plan.credits);
          }
          await sql`
            update subscriptions set status = 'active', updated_at = now()
            where stripe_subscription_id = ${subId}
          `;
        }
        break;
      }

      // Failed subscription renewal charge -- Stripe retries automatically
      // per its own retry schedule and will also fire
      // customer.subscription.updated (handled below) once the
      // subscription's status actually changes, so this case only sends
      // the warning email; it doesn't touch `subscriptions.status` itself
      // to avoid two handlers racing to write the same field.
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId =
          ((invoice as any).subscription as string | null) ??
          ((invoice as any).parent?.subscription_details?.subscription as string | null) ??
          null;
        if (!subId) {
          console.error("[billing/webhook] invoice.payment_failed had no subscription id", { invoiceId: invoice.id });
          break;
        }

        const rows = await sql`
          select s.user_id, s.plan, u.email, u.name
          from subscriptions s
          left join users u on u.clerk_id = s.user_id
          where s.stripe_subscription_id = ${subId}
        `;
        const row = rows[0] as { user_id: string; plan: string; email: string | null; name: string | null } | undefined;
        if (row?.email) {
          const plan = getPlanById(row.plan);
          await sendPaymentFailedEmail(row.email, row.name, plan?.name || row.plan);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await sql`
          update subscriptions set status = ${sub.status}, updated_at = now()
          where stripe_subscription_id = ${sub.id}
        `;
        break;
      }

      default:
        break;
    }
  } catch (err: any) {
    // Signature is already verified at this point, so a failure here is OUR
    // bug (e.g. Neon unreachable), not a forged request. Return 500 so
    // Stripe retries with backoff instead of silently dropping the credit.
    console.error("[billing/webhook] handler error:", err?.message || err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const dynamic = 'force-dynamic'
