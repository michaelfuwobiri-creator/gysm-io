import { parseProductInput } from "@/lib/stores/core";
import { deleteProduct, updateProduct } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import { json, readJson, requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";

type Ctx = { params: { id: string; productId: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const parsed = parseProductInput(await readJson(req));
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const product = await updateProduct(await storeDb(r.store), r.store.id, params.productId, parsed.value);
  if (!product) return json({ error: "Product not found." }, 404);
  return json({ product });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const ok = await deleteProduct(await storeDb(r.store), r.store.id, params.productId);
  if (!ok) return json({ error: "Product not found." }, 404);
  return json({ ok: true });
}
