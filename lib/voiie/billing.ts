// VOIIE's payment step: quote a lead one of the voiie_* PRICING_PLANS
// (lib/stripe.ts), take payment via a normal Stripe Checkout Session (the
// exact same flow app/api/billing/checkout/route.ts already uses for
// gysm.io's own plans -- see createVoiieCheckoutSession below), and on
// checkout.session.completed (app/api/billing/webhook/route.ts routes
// here when metadata.source === "voiie"), convert the lead into a real
// GYSM.IO account that owns the demo build going forward.

import { clerkClient } from "@clerk/nextjs/server";
import { getStripe, getPlanById, getPriceId, DEFAULT_LIVE_PRICE_IDS } from "@/lib/stripe";
import { addCredits } from "@/lib/credits";
import { sql } from "@/lib/db";
import { addDomainToProject } from "@/lib/vercelDomains";
import { getLeadUnscoped, setPlanQuote, markConverted, createCustomer, createRenewal, getConsultationAnswers } from "@/lib/voiie/db";
import type { LeadAnswers, VoiiePlanId } from "@/types/voiie";

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "customer"
  );
}

/** $15/mo-equivalent baseline renewal (domain + hosting), matching the
 *  brief's "Renew $15" figure -- flat regardless of plan, since domain +
 *  hosting cost doesn't scale with which of the 3 build plans they bought. */
const ANNUAL_RENEWAL_CENTS = 1500;

/**
 * Ad-hoc Stripe Checkout link for a renewal/repair/upgrade/add-feature
 * charge (see voiie_renewals) -- these are one-off amounts that don't map
 * to one of the 3 fixed voiie_* Prices in lib/stripe.ts, so (like gysm.io's
 * own one-time-credit-pack flow) this uses inline `price_data` on a
 * Checkout Session rather than a pre-created Price.
 */
export async function createRenewalCheckoutLink(params: { renewalId: string; customerId: string; label: string; amountCents: number }): Promise<{ url: string; sessionId: string }> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: { currency: "usd", product_data: { name: params.label }, unit_amount: params.amountCents },
        quantity: 1,
      },
    ],
    metadata: { source: "voiie_renewal", renewalId: params.renewalId, customerId: params.customerId },
    success_url: `${siteUrl}/voiie?renewalId=${params.renewalId}&success=true`,
    cancel_url: `${siteUrl}/voiie?renewalId=${params.renewalId}&canceled=true`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { url: session.url, sessionId: session.id };
}

export async function createVoiieCheckoutSession(leadId: string, planId: VoiiePlanId): Promise<{ url: string }> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.contact_email) throw new Error("This lead has no email on file -- collect one in the consultation before checkout.");

  const plan = getPlanById(planId);
  if (!plan) throw new Error(`Unknown VOIIE plan "${planId}".`);
  const priceId = getPriceId(planId);
  if (!priceId) throw new Error(`${plan.priceIdEnvVar} is not configured.`);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

  function createSession(price: string) {
    return getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],
      customer_email: lead.contact_email,
      // source + leadId (not client_reference_id/userId, which the normal
      // gysm.io checkout path uses) is how the webhook tells a VOIIE
      // conversion apart from a regular plan purchase -- see the branch in
      // app/api/billing/webhook/route.ts.
      metadata: { source: "voiie", leadId: lead.id, planId: plan!.id },
      success_url: `${siteUrl}/voiie?leadId=${lead.id}&success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/voiie?leadId=${lead.id}&canceled=true`,
    });
  }

  // See app/api/billing/checkout/route.ts for why this retries once
  // against DEFAULT_LIVE_PRICE_IDS -- a stale/deactivated Price in this
  // plan's Vercel env var already took down gysm.io's own checkout once
  // (STRIPE_*_PRICE_ID pointed at a Price this session deactivated during
  // a repricing); VOIIE's checkout reads the exact same env vars via
  // getPriceId, so it's exposed to the identical failure mode.
  let session;
  try {
    session = await createSession(priceId);
  } catch (err: any) {
    const looksStale = /inactive|no such price|resource_missing/i.test(err?.message || err?.code || "");
    const fallbackPriceId = DEFAULT_LIVE_PRICE_IDS[plan.id];
    if (looksStale && fallbackPriceId && fallbackPriceId !== priceId) {
      console.error(
        `[voiie/billing] ${plan.priceIdEnvVar}="${priceId}" is rejected by Stripe (${err?.message || err}) -- ` +
          `retrying with known-good price ${fallbackPriceId}. Fix ${plan.priceIdEnvVar} in Vercel to clear this warning.`
      );
      session = await createSession(fallbackPriceId);
    } else {
      throw err;
    }
  }

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

  // 6. Production/renewal bookkeeping (voiie_customers + voiie_renewals --
  // see db/migrations/0017_voiie_v2.sql). Best-effort and non-fatal: the
  // account + demo transfer above are the part that must succeed for the
  // customer to actually have a working, owned site; a slug collision or
  // an unconfigured Vercel/domains API shouldn't undo that.
  try {
    const { answers } = await getConsultationAnswers(lead.id);
    const typedAnswers = answers as LeadAnswers;
    const businessName = typedAnswers.business?.name || lead.handle.replace(/^@/, "");
    const baseSlug = slugify(businessName);

    let slug = baseSlug;
    for (let n = 2; n < 20; n++) {
      const clash = await sql`select 1 from voiie_customers where slug = ${slug} limit 1`;
      if (!clash[0]) break;
      slug = `${baseSlug}-${n}`;
    }

    const gysmSubdomain = `${slug}.gysm.io`;
    try {
      const result = await addDomainToProject(gysmSubdomain);
      await sql`
        update projects
        set custom_domain = ${gysmSubdomain},
            custom_domain_status = ${result.verified ? "verified" : "pending"},
            custom_domain_verification = ${JSON.stringify(result.verification)}
        where id = ${lead.demo_project_id}
      `;
    } catch (err) {
      // Not fatal -- the site is already live at /publish/[id] regardless;
      // this only adds the prettier <slug>.gysm.io vanity domain, which
      // needs gysm.io's DNS zone reachable from the Vercel Domains API.
      console.warn(`[voiie/billing] could not provision ${gysmSubdomain} (site is still live at /publish/${lead.demo_project_id}):`, (err as Error).message);
    }

    const rawDomain = (typedAnswers.domain ?? "").split(" — ")[0]?.trim();
    const hasCustomDomain = Boolean(rawDomain) && /\./.test(rawDomain);

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const customer = await createCustomer({
      leadId: lead.id,
      ownerUserId: lead.owner_user_id,
      convertedUserId: clerkUserId,
      businessName,
      slug,
      gysmSubdomain,
      customDomain: hasCustomDomain ? rawDomain : null,
      planId,
      brandKit: typedAnswers.assets ? { logoUrl: typedAnswers.assets.logoUrl, colors: typedAnswers.assets.colors, theme: typedAnswers.assets.theme } : {},
      expiryDate,
    });

    await createRenewal({ customerId: customer.id, type: "domain", amountCents: ANNUAL_RENEWAL_CENTS, dueDate: expiryDate });
  } catch (err) {
    console.error("[voiie/billing] production/renewal bookkeeping failed (account + demo transfer already succeeded):", (err as Error).message);
  }
}
