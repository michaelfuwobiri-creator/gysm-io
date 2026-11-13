import { NextResponse } from "next/server";
import { refreshStripeStatus } from "@/lib/stores/payments";
import { requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe sends the seller here after onboarding: re-check the account, then back to the builder agent. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  let ready = false;
  if (r.store.stripe_account_id) {
    try {
      ready = await refreshStripeStatus(r.store.stripe_account_id);
    } catch (e: any) {
      console.error("[stores/stripe/return] status check failed:", e?.message || e);
    }
  }
  const url = new URL("/agent", req.url);
  url.searchParams.set("prompt", ready ? `Stripe is connected for my store ${r.store.slug}. What's next?` : `I came back from Stripe for my store ${r.store.slug}. Is payments setup finished?`);
  return NextResponse.redirect(url);
}
