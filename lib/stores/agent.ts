// GYSM Stores tools for the agent (see STORE_TOOL_DEFS in lib/agentCore.ts).
// Every call is scoped to the signed-in user's own stores; secrets arrive only
// through the private box the user types into, never through the model.
import { isSupportedCurrency, parseProductInput, slugify, slugProblem, storeUrl, storesEnabled } from "./core";
import { isKeyedProvider, isStoreProvider, setupGuideText, type StoreProvider } from "./integrations";
import { createProduct, createStore, listConnections, listProducts, listStoresForUser, type StoreRow } from "./db";
import { connectProvider, storeDb } from "./connections";

type ToolResult = { ok: boolean; output: string };

const site = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io").replace(/\/+$/, "");

async function findStore(userId: string, slug: unknown): Promise<StoreRow | null> {
  if (typeof slug !== "string") return null;
  const stores = await listStoresForUser(userId);
  return stores.find((s) => s.slug === slug.trim().toLowerCase()) ?? null;
}

export async function executeStoreTool(userId: string, name: string, args: any, secret?: string): Promise<ToolResult> {
  if (!storesEnabled()) return { ok: false, output: "Online stores aren't enabled on this GYSM instance yet." };
  switch (name) {
    case "store_setup_guide": {
      const wanted: StoreProvider[] = Array.isArray(args?.providers) ? args.providers.filter(isStoreProvider) : [];
      return { ok: true, output: setupGuideText(wanted.length ? wanted : undefined) };
    }
    case "store_status": {
      const stores = await listStoresForUser(userId);
      if (!stores.length) return { ok: true, output: "The user has no stores yet. Create one with store_create." };
      const lines = await Promise.all(
        stores.map(async (s) => {
          const conns = await listConnections(s.id);
          const connected = conns.map((c) => `${c.provider}: ${c.status === "verified" ? "connected" : `problem (${c.error_message ?? "unknown"})`}`).join(", ") || "none";
          let products = "?";
          try {
            products = String((await listProducts(await storeDb(s), s.id)).length);
          } catch {
            products = "database unreachable";
          }
          return `- ${s.name} (slug ${s.slug}): ${s.status}; payments ${s.stripe_charges_enabled ? "ready" : "NOT ready - user must press Connect Stripe"}; database ${s.db_provider === "neon" ? "their own Neon" : "GYSM"}; products ${products}; own accounts: ${connected}; public address ${storeUrl(s.slug)}; dashboard ${site()}/stores/${s.id}`;
        }),
      );
      return { ok: true, output: lines.join("\n") };
    }
    case "store_create": {
      const storeName = typeof args?.name === "string" ? args.name.trim() : "";
      if (!storeName || storeName.length > 80) return { ok: false, output: "Give the store a name of up to 80 characters." };
      const slug = typeof args?.slug === "string" && args.slug.trim() ? args.slug.trim().toLowerCase() : slugify(storeName);
      const problem = slugProblem(slug);
      if (problem) return { ok: false, output: `Bad store address "${slug}": ${problem}` };
      if ((await listStoresForUser(userId)).length >= 10) return { ok: false, output: "The user already has 10 stores, the maximum." };
      const store = await createStore({ userId, name: storeName, slug, currency: isSupportedCurrency(args?.currency) ? args.currency : "eur", notifyEmail: null });
      if (!store) return { ok: false, output: `The address "${slug}" is taken. Pick another slug.` };
      return {
        ok: true,
        output: `Created "${store.name}" as a draft (slug ${store.slug}, currency ${store.currency.toUpperCase()}). Dashboard: ${site()}/stores/${store.id}. Public address once open: ${storeUrl(store.slug)}. Next: add products, then the user presses Connect Stripe on the dashboard and finally Open store.`,
      };
    }
    case "store_add_product": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const parsed = parseProductInput({ name: args?.name, price: args?.price, description: args?.description, stock: args?.stock, imageUrl: args?.image_url });
      if ("error" in parsed) return { ok: false, output: parsed.error };
      const db = await storeDb(store);
      if ((await listProducts(db, store.id)).length >= 500) return { ok: false, output: "The store already has 500 products, the maximum." };
      const product = await createProduct(db, store.id, parsed.value);
      return { ok: true, output: `Added "${product.name}" to ${store.name}.` };
    }
    case "store_connect": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      if (!isKeyedProvider(args?.provider)) return { ok: false, output: "provider must be neon, supabase, clerk or shippo. Stripe is connected with the Connect Stripe button on the dashboard." };
      if (!secret || !secret.trim()) return { ok: false, output: "The user didn't type a value." };
      const outcome = await connectProvider(store, args.provider, args?.public_value, secret);
      return { ok: outcome.ok, output: outcome.message };
    }
  }
  return { ok: false, output: `Unknown tool: ${name}` };
}
