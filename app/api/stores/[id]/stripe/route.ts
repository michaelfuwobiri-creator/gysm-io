import { refreshStripeStatus, stripeOnboardingLink } from "@/lib/stores/payments";
import { json, requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";

/** Starts (or resumes) Stripe's own onboarding for the seller's account. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  try {
    const url = await stripeOnboardingLink(r.store, r.user.email);
    return json({ url });
  } catch (e: any) {
    console.error("[stores/stripe] onboarding failed:", e?.message || e);
    return json({ error: "Stripe couldn't start the setup. Check that Stripe Connect is enabled for GYSM, then try again." }, 502);
  }
}

/** Re-checks whether Stripe has enabled payments for the seller. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  if (!r.store.stripe_account_id) return json({ connected: false, chargesEnabled: false });
  try {
    const chargesEnabled = await refreshStripeStatus(r.store.stripe_account_id);
    return json({ connected: true, chargesEnabled });
  } catch (e: any) {
    console.error("[stores/stripe] status failed:", e?.message || e);
    return json({ error: "Couldn't check Stripe right now." }, 502);
  }
}
