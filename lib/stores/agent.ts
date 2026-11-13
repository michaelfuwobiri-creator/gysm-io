// GYSM Stores tools for the agent (see STORE_TOOL_DEFS in lib/agentCore.ts).
// Every call is scoped to the signed-in user's own stores; secrets arrive only
// through the private box the user types into, never through the model.
import { formatMoney, isSupportedCurrency, parseProductInput, slugify, slugProblem, storeCanSell, storeUrl, storesEnabled } from "./core";
import { isKeyedProvider, isStoreProvider, setupGuideText, type StoreProvider } from "./integrations";
import {
  createProduct, createStore, deleteProduct, listConnections, listOrders, listProducts, listStoresForUser, updateProduct, updateStore,
  type ProductRow, type StoreRow,
} from "./db";
import { connectProvider, storeDb } from "./connections";
import { refreshStripeStatus, stripeOnboardingLink } from "./payments";

type ToolResult = { ok: boolean; output: string };

async function findStore(userId: string, slug: unknown): Promise<StoreRow | null> {
  if (typeof slug !== "string") return null;
  const stores = await listStoresForUser(userId);
  return stores.find((s) => s.slug === slug.trim().toLowerCase()) ?? null;
}

function findProduct(products: ProductRow[], ref: unknown): ProductRow | null | "ambiguous" {
  if (typeof ref !== "string" || !ref.trim()) return null;
  const q = ref.trim().toLowerCase();
  const byId = products.find((p) => p.id === q);
  if (byId) return byId;
  const exact = products.filter((p) => p.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return "ambiguous";
  const partial = products.filter((p) => p.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  return partial.length > 1 ? "ambiguous" : null;
}

export async function executeStoreTool(userId: string, name: string, args: any, secret?: string, email?: string | null): Promise<ToolResult> {
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
          return `- ${s.name} (slug ${s.slug}): ${s.status}; payments ${s.stripe_charges_enabled ? "ready" : "NOT ready (use store_payments_link)"}; database ${s.db_provider === "neon" ? "their own Neon" : "GYSM"}; products ${products}; order alerts to ${s.notify_email ?? "their account email"}; ask for shipping address ${s.collect_shipping ? "yes" : "no"}; own accounts: ${connected}; public address ${storeUrl(s.slug)}`;
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
      const store = await createStore({ userId, name: storeName, slug, currency: isSupportedCurrency(args?.currency) ? args.currency : "eur", notifyEmail: typeof email === "string" ? email : null });
      if (!store) return { ok: false, output: `The address "${slug}" is taken. Pick another slug.` };
      return {
        ok: true,
        output: `Created "${store.name}" as a draft (slug ${store.slug}, currency ${store.currency.toUpperCase()}). Preview (only the owner can see it while a draft): ${storeUrl(store.slug)}. Next: add products, then store_payments_link so the user connects Stripe, then store_update with status "live".`,
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
    case "store_update_product":
    case "store_remove_product": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const db = await storeDb(store);
      const products = await listProducts(db, store.id);
      const product = findProduct(products, args?.product);
      if (product === "ambiguous") return { ok: false, output: `Several products match "${args?.product}". Use the exact name: ${products.map((p) => p.name).join(", ")}.` };
      if (!product) return { ok: false, output: `No product matches "${args?.product}". Products: ${products.map((p) => p.name).join(", ") || "none"}.` };
      if (name === "store_remove_product") {
        await deleteProduct(db, store.id, product.id);
        return { ok: true, output: `Removed "${product.name}" from ${store.name}.` };
      }
      const parsed = parseProductInput({
        name: args?.name ?? product.name,
        description: args?.description ?? product.description,
        price: args?.price ?? (product.price_cents / 100).toFixed(2),
        imageUrl: args?.image_url ?? product.image_url ?? "",
        stock: args?.unlimited_stock === true ? "" : args?.stock ?? product.stock ?? "",
        active: typeof args?.visible === "boolean" ? args.visible : product.active,
      });
      if ("error" in parsed) return { ok: false, output: parsed.error };
      const updated = await updateProduct(db, store.id, product.id, parsed.value);
      if (!updated) return { ok: false, output: "The product could not be updated." };
      return { ok: true, output: `Updated "${updated.name}": ${formatMoney(updated.price_cents, store.currency)}, ${updated.stock === null ? "unlimited stock" : `${updated.stock} in stock`}, ${updated.active ? "visible" : "hidden"}.` };
    }
    case "store_orders": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const orders = await listOrders(await storeDb(store), store.id, 20);
      if (!orders.length) return { ok: true, output: `${store.name} has no orders yet.` };
      return {
        ok: true,
        output: orders
          .map((o) => {
            const items = (o.items ?? []).map((i) => `${i.quantity}x ${i.name}`).join(", ");
            const ship = o.shipping?.address ? ` ship to ${[o.shipping.name, o.shipping.address.city, o.shipping.address.country].filter(Boolean).join(", ")}` : "";
            return `- ${new Date(o.created_at).toISOString().slice(0, 16).replace("T", " ")} ${o.status} ${formatMoney(o.amount_total_cents, o.currency)} from ${o.customer_name || o.customer_email || "a customer"}: ${items}${ship}`;
          })
          .join("\n"),
      };
    }
    case "store_payments_link": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      if (store.stripe_account_id) {
        try {
          if (await refreshStripeStatus(store.stripe_account_id)) return { ok: true, output: `Stripe payments are already ready for ${store.name}.` };
        } catch {
          /* fall through to a fresh link */
        }
      }
      try {
        const url = await stripeOnboardingLink(store, email ?? null);
        return { ok: true, output: `Give the user this link to connect their own Stripe account (it works once and expires in a few minutes; call again for a new one): ${url}\nThey sign up or sign in on Stripe's own page and come back to the builder when done.` };
      } catch (e: any) {
        console.error("[agent] store_payments_link failed:", e?.message || e);
        return { ok: false, output: "Stripe couldn't start the setup. Stripe Connect may not be enabled for GYSM yet; tell the user to try again later." };
      }
    }
    case "store_update": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const patch: Parameters<typeof updateStore>[2] = {};
      if (typeof args?.name === "string") {
        const n = args.name.trim();
        if (!n || n.length > 80) return { ok: false, output: "The name must be 1-80 characters." };
        patch.name = n;
      }
      if (typeof args?.description === "string") patch.description = args.description.trim().slice(0, 2000);
      if (typeof args?.alert_email === "string") {
        const e = args.alert_email.trim();
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, output: "That alert email isn't valid." };
        patch.notifyEmail = e || null;
      }
      if (typeof args?.collect_shipping === "boolean") patch.collectShipping = args.collect_shipping;
      if (args?.status !== undefined) {
        if (!["draft", "live", "paused"].includes(args.status)) return { ok: false, output: "status must be draft, live or paused." };
        if (args.status === "live" && !storeCanSell({ status: "live", stripe_charges_enabled: store.stripe_charges_enabled })) {
          return { ok: false, output: "Stripe payments aren't ready yet. Use store_payments_link first." };
        }
        patch.status = args.status;
      }
      const updated = await updateStore(store.id, userId, patch);
      if (!updated) return { ok: false, output: "The store could not be updated." };
      return { ok: true, output: `Saved ${updated.name}: status ${updated.status}${updated.status === "live" ? `, open at ${storeUrl(updated.slug)}` : ""}.` };
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
