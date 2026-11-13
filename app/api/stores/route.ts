import { isSupportedCurrency, slugify, slugProblem, storeUrl } from "@/lib/stores/core";
import { createStore, listStoresForUser } from "@/lib/stores/db";
import { json, readJson, requireSeller } from "@/lib/stores/api";

export const runtime = "nodejs";

export async function GET() {
  const r = await requireSeller();
  if ("error" in r) return r.error;
  const stores = await listStoresForUser(r.user.id);
  return json({ stores: stores.map((s) => ({ ...s, url: storeUrl(s.slug) })) });
}

export async function POST(req: Request) {
  const r = await requireSeller();
  if ("error" in r) return r.error;
  const body = await readJson(req);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return json({ error: "Give the store a name (up to 80 characters)." }, 400);
  const slug = typeof body?.slug === "string" && body.slug.trim() ? body.slug.trim().toLowerCase() : slugify(name);
  const problem = slugProblem(slug);
  if (problem) return json({ error: `Store address: ${problem}` }, 400);
  const currency = isSupportedCurrency(body?.currency) ? body.currency : "eur";
  const existing = await listStoresForUser(r.user.id);
  if (existing.length >= 10) return json({ error: "You can have up to 10 stores." }, 400);
  const store = await createStore({ userId: r.user.id, name, slug, currency, notifyEmail: r.user.email });
  if (!store) return json({ error: "That store address is taken. Try another." }, 409);
  return json({ store: { ...store, url: storeUrl(store.slug) } }, 201);
}
