import { startStoreCheckout } from "@/lib/stores/checkout";
import { json, readJson } from "@/lib/stores/api";

export const runtime = "nodejs";

/** Public: a customer's cart -> a Stripe Checkout page on the seller's account. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const r = await startStoreCheckout(body?.slug, body?.items);
  return "error" in r ? json({ error: r.error }, r.status) : json({ url: r.url });
}
