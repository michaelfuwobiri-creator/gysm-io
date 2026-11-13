import { parseProductInput } from "@/lib/stores/core";
import { createProduct, listProducts } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import { json, readJson, requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const parsed = parseProductInput(await readJson(req));
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const db = await storeDb(r.store);
  if ((await listProducts(db, r.store.id)).length >= 500) return json({ error: "A store can have up to 500 products." }, 400);
  const product = await createProduct(db, r.store.id, parsed.value);
  return json({ product }, 201);
}
