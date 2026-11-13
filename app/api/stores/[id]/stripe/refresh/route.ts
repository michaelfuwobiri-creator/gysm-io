import { NextResponse } from "next/server";
import { stripeOnboardingLink } from "@/lib/stores/payments";
import { requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe's onboarding link expired or was reused: make a fresh one and continue. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  try {
    return NextResponse.redirect(await stripeOnboardingLink(r.store, r.user.email));
  } catch (e: any) {
    console.error("[stores/stripe/refresh] failed:", e?.message || e);
    return NextResponse.redirect(new URL("/agent", req.url));
  }
}
