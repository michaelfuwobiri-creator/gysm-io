import { isKeyedProvider } from "@/lib/stores/integrations";
import { deleteConnection } from "@/lib/stores/db";
import { connectProvider } from "@/lib/stores/connections";
import { json, readJson, requireOwnedStore } from "@/lib/stores/api";

export const runtime = "nodejs";

/** Saves the seller's own keys for one provider after checking them with the provider. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const body = await readJson(req);
  if (!isKeyedProvider(body?.provider)) return json({ error: "Unknown service." }, 400);
  const outcome = await connectProvider(r.store, body.provider, body.publicValue, body.secret);
  return json(outcome, outcome.ok ? 200 : 400);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const r = await requireOwnedStore(params.id);
  if ("error" in r) return r.error;
  const provider = new URL(req.url).searchParams.get("provider");
  if (!isKeyedProvider(provider)) return json({ error: "Unknown service." }, 400);
  if (provider === "neon" && r.store.db_provider === "neon") {
    return json({ error: "This store's products and orders live in your Neon database, so Neon can't be disconnected." }, 400);
  }
  await deleteConnection(r.store.id, provider);
  return json({ ok: true });
}
