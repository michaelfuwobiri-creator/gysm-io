import { getStripe, getPlanById, getPriceId, DEFAULT_LIVE_PRICE_IDS } from "@/lib/stripe";

// The GYSM plan checkout, shared by POST /api/billing/checkout (a signed-in
// browser) and the MCP tool subscribe_to_gysm (an AI assistant acting for a
// user who connected their own GYSM API key). Either way the person opens the
// returned Stripe link and pays there; nothing is charged here.
export type PlanCheckoutResult = { ok: true; url: string } | { ok: false; status: number; error: string };

export async function createPlanCheckout(user: { id: string; email: string | null }, planId: string): Promise<PlanCheckoutResult> {
  const plan = getPlanById(planId);
  if (!plan) return { ok: false, status: 400, error: `Unknown plan "${planId}".` };
  // Retired plans (packs, Builder/Pro/Studio) are no longer sold; VOIIE plans
  // have their own checkout in lib/voiie/billing.ts.
  if (plan.hidden) return { ok: false, status: 400, error: "That plan is no longer available. Choose the GYSM monthly plan." };

  const priceId = getPriceId(planId);
  if (!priceId && !plan.inlineAmount) {
    console.error(`[billing/checkout] missing env var ${plan.priceIdEnvVar} for plan ${planId}`);
    return { ok: false, status: 500, error: "This plan isn't configured yet. Try again shortly." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

  function createSession(price: string | undefined) {
    // No Price ID configured: create the price inline from the plan itself.
    const lineItem: any = price
      ? { price, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: plan!.currency,
            unit_amount: plan!.inlineAmount,
            product_data: { name: plan!.name },
            ...(plan!.interval === "month" ? { recurring: { interval: "month" } } : {}),
          },
        };
    return getStripe().checkout.sessions.create({
      mode: plan!.interval === "month" ? "subscription" : "payment",
      payment_method_types: ["card"],
      line_items: [lineItem],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id, planId: plan!.id },
      success_url: `${siteUrl}/agent?subscribed=1`,
      cancel_url: `${siteUrl}/pricing?canceled=true`,
    });
  }

  try {
    const session = await createSession(priceId);
    return session.url ? { ok: true, url: session.url } : { ok: false, status: 500, error: "Could not start checkout. Please try again." };
  } catch (err: any) {
    // A stale/deactivated Price in the STRIPE_*_PRICE_ID env var (see
    // DEFAULT_LIVE_PRICE_IDS in lib/stripe.ts for the real incident this
    // guards against) shouldn't take checkout down for that plan -- retry
    // once against the known-good live Price ID before giving up, and log
    // loudly so the actual env var mismatch gets fixed instead of masked
    // forever.
    const looksStale = /inactive|no such price|resource_missing/i.test(err?.message || err?.code || "");
    const fallbackPriceId = DEFAULT_LIVE_PRICE_IDS[plan.id];
    if (looksStale && fallbackPriceId && fallbackPriceId !== priceId) {
      console.error(
        `[billing/checkout] ${plan.priceIdEnvVar}="${priceId}" is rejected by Stripe (${err?.message || err}) -- ` +
          `retrying with known-good price ${fallbackPriceId}. Fix ${plan.priceIdEnvVar} in Vercel to clear this warning.`
      );
      try {
        const session = await createSession(fallbackPriceId);
        if (session.url) return { ok: true, url: session.url };
      } catch (err2: any) {
        console.error("[billing/checkout] Stripe error (fallback price also failed):", err2?.message || err2);
      }
      return { ok: false, status: 500, error: "Could not start checkout. Please try again." };
    }
    console.error("[billing/checkout] Stripe error:", err?.message || err);
    return { ok: false, status: 500, error: "Could not start checkout. Please try again." };
  }
}
