import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPlanById, getPriceId, DEFAULT_LIVE_PRICE_IDS } from "@/lib/stripe";
import { getUser } from "@/lib/auth";

// This route did not exist at all in the repo -- app/pricing/page.tsx was
// already calling POST /api/billing/checkout, and two throwaway scripts
// (fix.js, fix2.js) show it was written locally at some point, but no real
// route.ts ever made it into the committed app/api/billing/ directory.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before upgrading.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let planId: string;
  try {
    const body = await req.json();
    planId = (body?.planId ?? body?.plan ?? "").toString();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const plan = getPlanById(planId);
  if (!plan) {
    return NextResponse.json({ error: `Unknown plan "${planId}".` }, { status: 400 });
  }

  const priceId = getPriceId(planId);
  if (!priceId) {
    console.error(`[billing/checkout] missing env var ${plan.priceIdEnvVar} for plan ${planId}`);
    return NextResponse.json(
      { error: "This plan isn't configured yet. Try again shortly." },
      { status: 500 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

  function createSession(price: string) {
    return getStripe().checkout.sessions.create({
      mode: plan.interval === "month" ? "subscription" : "payment",
      payment_method_types: ["card"],
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { userId: user.id, planId: plan.id },
      success_url: `${siteUrl}/builder?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing?canceled=true`,
    });
  }

  try {
    const session = await createSession(priceId);
    return NextResponse.json({ url: session.url });
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
        return NextResponse.json({ url: session.url });
      } catch (err2: any) {
        console.error("[billing/checkout] Stripe error (fallback price also failed):", err2?.message || err2);
        return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
      }
    }
    console.error("[billing/checkout] Stripe error:", err?.message || err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'

