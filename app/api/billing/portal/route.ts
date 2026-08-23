import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Self-serve subscription management -- update card, view invoices,
// cancel. Only applies to monthly subscribers: the subscriptions table
// only gets a stripe_customer_id row for plan.interval === "month"
// checkouts (see app/api/billing/webhook/route.ts) -- one-time credit
// pack purchases don't create an ongoing subscription, so there's
// nothing for the portal to manage for those users.
export async function POST(_req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select stripe_customer_id from subscriptions where user_id = ${user.id} limit 1
    `;
    const customerId = (rows[0] as any)?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return NextResponse.json(
        { error: "No subscription to manage yet. Credit packs don't need billing management -- see /pricing to subscribe to a plan." },
        { status: 404 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("[billing/portal] failed to create portal session:", error.message);
    return NextResponse.json({ error: "Could not open billing portal. Please try again." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
