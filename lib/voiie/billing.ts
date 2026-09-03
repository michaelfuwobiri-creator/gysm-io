// VOIIE's payment step: quote a lead one of the voiie_* PRICING_PLANS
// (lib/stripe.ts), take payment via a normal Stripe Checkout Session (the
// exact same flow app/api/billing/checkout/route.ts already uses for
// gysm.io's own plans -- see createVoiieCheckoutSession below), and on
// checkout.session.completed (app/api/billing/webhook/route.ts routes
// here when metadata.source === "voiie"), convert the lead into a real
// GYSM.IO account that owns the demo build going forward.

import { clerkClient } from "@clerk/nextjs/server";
import { getStripe, getPlanById, getPriceId } from "@/lib/stripe";
import { addCredits } from "@/lib/credits";
import { sql } from "@/lib/db";
import { getLeadUnscoped, setPlanQuote, markConverted } from "@/lib/voiie/db";
import type { VoiiePlanId } from "@/types/voiie";

export async function createVoiieCheckoutSession(leadId: string, planId: VoiiePlanId): Promise<{ url: string }> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.contact_email) throw new Error("This lead has no email on file -- collect one in the consultation before checkout.");

  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Unknown VOIIE plan "${planId}".`);
  const priceId = getPriceId(planId);
  if (!priceId) throw new Error(`${plan.priceIdEnvVar} is not configured.`);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: lead.contact_email,
    // source + leadId (not client_reference_id/userId, which the normal
    // gysm.io checkout path uses) is how the webhook tells a VOIIE
    // conversion apart from a regular plan purchase -- see the branch in
    // app/api/billing/webhook/route.ts.
    metadata: { source: "voiie", leadId: lead.id, planId: plan.id },
    success_url: `${siteUrl}/voiie?leadId=${lead.id}&success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/voiie?leadId=${lead.id}&canceled=true`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  await setPlanQuote(lead.id, plan.id, session.id);
  return { url: session.url };
}

/**
 * Runs on checkout.session.completed for a VOIIE-sourced payment:
 *  1. Find or create a real Clerk account for the lead's email.
 *  2. Transfer the free demo project to that account.
 *  3. Grant the plan's welcome credits (see lib/credits-constants.ts).
 *  4. Mark the lead converted.
 *
 * Idempotent-ish: re-running for the same lead is safe -- finding the
 * Clerk user by email returns the same account, and the project update /
 * credit grant / lead update all just re-apply the same end state.
 */
export async function convertLeadToCustomer(leadId: string, planId: string, email: string): Promise<void> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) {
    console.error("[voiie/billing] convertLeadToCustomer: lead not found", { leadId });
    return;
  }
  if (!lead.demo_project_id) {
    console.error("[voiie/billing] convertLeadToCustomer: lead has no demo project to transfer", { leadId });
    return;
  }

  const client = await clerkClient();

  // 1. Find or create the Clerk account. Clerk instances on this project
  // support email-code sign-in (see app/sign-in), so a freshly created,
  // passwordless account is immediately usable by the customer signing in
  // with the same email Stripe just charged.
  let clerkUserId: string;
  const existing = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  if (existing.data.length > 0) {
    clerkUserId = existing.data[0].id;
  } else {
    const created = await client.users.createUser({
      emailAddress: [email],
      skipPasswordRequirement: true,
      skipPasswordChecks: true,
    });
    clerkUserId = created.id;
  }

  // 2. Mirror the users row ourselves rather than waiting on the async
  // Clerk webhook (app/api/webhooks/clerk/route.ts) to sync it -- the
  // credit grant below needs a row to attach to right now.
  const user = await client.users.getUser(clerkUserId);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email;
  await sql`
    insert into users (clerk_id, email, name, image_url)
    values (${clerkUserId}, ${email}, ${name}, ${user.imageUrl ?? null})
    on conflict (clerk_id) do update set email = excluded.email, updated_at = now()
  `;

  // 3. Transfer the demo build to the new owner.
  await sql`update projects set user_id = ${clerkUserId} where id = ${lead.demo_project_id}`;

  // 4. Welcome credits, scaled by which tier they bought.
  const plan = getPlanById(planId);
  if (plan) await addCredits(clerkUserId, plan.credits);

  // 5. Close the loop on the lead record.
  await markConverted(lead.id, clerkUserId);
}
