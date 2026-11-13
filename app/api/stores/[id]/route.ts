import { storeCanSell, storeUrl } from "@/lib/stores/core";
import { listConnections, listOrders, listProducts, updateStore } from "@/lib/stores/db";
import { publicConnection, storeDb } from "@/lib/stores/connections";
import { json, readJson, requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const { store } = r;
  let products: unknown[] = [];
  let orders: unknown[] = [];
  let dbError: string | null = null;
  try {
    const db = await storeDb(store);
    [products, orders] = await Promise.all([listProducts(db, store.id), listOrders(db, store.id)]);
  } catch (e: any) {
    dbError = String(e?.message ?? "The store database couldn't be reached.");
  }
  const connections = (await listConnections(store.id)).map(publicConnection);
  return json({ store: { ...store, url: storeUrl(store.slug), canSell: storeCanSell(store) }, products, orders, connections, dbError });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const body = await readJson(req);
  if (!body) return json({ error: "Invalid request." }, 400);
  const patch: Parameters<typeof updateStore>[2] = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 80) return json({ error: "Give the store a name (up to 80 characters)." }, 400);
    patch.name = name;
  }
  if (typeof body.description === "string") patch.description = body.description.trim().slice(0, 2000);
  if (body.notifyEmail !== undefined) {
    const email = typeof body.notifyEmail === "string" ? body.notifyEmail.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email for order alerts." }, 400);
    patch.notifyEmail = email || null;
  }
  if (typeof body.collectShipping === "boolean") patch.collectShipping = body.collectShipping;
  if (body.status !== undefined) {
    if (!["draft", "live", "paused"].includes(body.status)) return json({ error: "Unknown status." }, 400);
    if (body.status === "live" && !r.store.stripe_charges_enabled) return json({ error: "Connect Stripe and finish its setup before opening the store." }, 400);
    patch.status = body.status;
  }
  const store = await updateStore(r.store.id, r.user.id, patch);
  return json({ store });
}
