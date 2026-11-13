// GYSM Stores tools for the agent (see STORE_TOOL_DEFS in lib/agentCore.ts).
// Every call is scoped to the signed-in user's own stores; secrets arrive only
// through the private box the user types into, never through the model.
import { formatMoney, isSupportedCurrency, parseProductInput, slugify, slugProblem, storeCanSell, storeUrl, storesEnabled } from "./core";
import { isKeyedProvider, isStoreProvider, setupGuideText, type StoreProvider } from "./integrations";
import {
  createProduct, createStore, deleteProduct, listConnections, listOrders, listProducts, listStoresForUser, updateProduct, updateStore,
  type ProductRow, type StoreRow,
} from "./db";
import { connectProvider, providerSecret, storeDb } from "./connections";
import { addressFromStripe, describeAddress, parseAddress, parseParcel, parseShippingRates, samePrice, type Address, type Parcel } from "./shipping";
import { buyLabel, getRate, quoteRates } from "./shippo";
import { getOrder, markOrderShipped } from "./db";
import { sellerEmail } from "./notify";
import { sendStoreShippedEmail } from "@/lib/email/send";
import { describeHours, formatSlot, isValidTimeZone, parseHoursInput, parseServiceInput } from "./booking";
import {
  cancelBooking, createService, deleteService, getHours, listServices, setHours, updateService, upcomingBookings, type ServiceRow,
} from "./db";
import { refreshStripeStatus, stripeOnboardingLink } from "./payments";

type ToolResult = { ok: boolean; output: string };

async function findStore(userId: string, slug: unknown): Promise<StoreRow | null> {
  if (typeof slug !== "string") return null;
  const stores = await listStoresForUser(userId);
  return stores.find((s) => s.slug === slug.trim().toLowerCase()) ?? null;
}

function findByName<T extends { id: string; name: string }>(items: T[], ref: unknown): T | null | "ambiguous" {
  if (typeof ref !== "string" || !ref.trim()) return null;
  const q = ref.trim().toLowerCase();
  const byId = items.find((p) => p.id === q);
  if (byId) return byId;
  const exact = items.filter((p) => p.name.toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return "ambiguous";
  const partial = items.filter((p) => p.name.toLowerCase().includes(q));
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
      const product = findByName<ProductRow>(products, args?.product);
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
            const tracked = o.tracking_number ? ` shipped (${[o.carrier, o.tracking_number].filter(Boolean).join(" ")})` : "";
            return `- ${new Date(o.created_at).toISOString().slice(0, 16).replace("T", " ")} ${o.status} ${formatMoney(o.amount_total_cents, o.currency)} from ${o.customer_name || o.customer_email || "a customer"}: ${items}${ship}${tracked} [order ${o.id}]`;
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
      if (args?.timezone !== undefined) {
        if (!isValidTimeZone(args.timezone)) return { ok: false, output: "Use a time zone name like Europe/Rome or Africa/Lagos." };
        patch.timezone = args.timezone;
      }
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
    case "store_add_service": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const parsed = parseServiceInput(args);
      if ("error" in parsed) return { ok: false, output: parsed.error };
      const db = await storeDb(store);
      if ((await listServices(db, store.id)).length >= 50) return { ok: false, output: "A store can have up to 50 services." };
      const service = await createService(db, store.id, parsed.value);
      const hours = await getHours(db, store.id);
      return {
        ok: true,
        output: `Added the service "${service.name}" (${service.duration_min} min, ${service.price_cents ? formatMoney(service.price_cents, store.currency) : "free"}). Customers book it on the store page.${hours.length ? "" : " No opening hours are set yet, so no times are bookable: set them with store_set_hours."}${service.price_cents && !store.stripe_charges_enabled ? " Paid bookings need Stripe: use store_payments_link." : ""}`,
      };
    }
    case "store_update_service":
    case "store_remove_service": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const db = await storeDb(store);
      const services = await listServices(db, store.id);
      const service = findByName<ServiceRow>(services, args?.service);
      if (service === "ambiguous") return { ok: false, output: `Several services match "${args?.service}". Use the exact name: ${services.map((v) => v.name).join(", ")}.` };
      if (!service) return { ok: false, output: `No service matches "${args?.service}". Services: ${services.map((v) => v.name).join(", ") || "none"}.` };
      if (name === "store_remove_service") {
        await deleteService(db, store.id, service.id);
        return { ok: true, output: `Removed the service "${service.name}". Existing bookings stay.` };
      }
      const parsed = parseServiceInput({
        name: args?.name ?? service.name,
        description: args?.description ?? service.description,
        duration_min: args?.duration_min ?? service.duration_min,
        price: args?.price ?? (service.price_cents / 100).toFixed(2),
        active: typeof args?.visible === "boolean" ? args.visible : service.active,
      });
      if ("error" in parsed) return { ok: false, output: parsed.error };
      const updated = await updateService(db, store.id, service.id, parsed.value);
      if (!updated) return { ok: false, output: "The service could not be updated." };
      return { ok: true, output: `Updated "${updated.name}": ${updated.duration_min} min, ${updated.price_cents ? formatMoney(updated.price_cents, store.currency) : "free"}, ${updated.active ? "bookable" : "hidden"}.` };
    }
    case "store_set_hours": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const parsed = parseHoursInput(args?.hours);
      if ("error" in parsed) return { ok: false, output: parsed.error };
      await setHours(await storeDb(store), store.id, parsed.rows);
      return { ok: true, output: `Opening hours for ${store.name} (${store.timezone}): ${describeHours(parsed.rows)}.` };
    }
    case "store_bookings": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const db = await storeDb(store);
      const [bookings, hours, services] = await Promise.all([upcomingBookings(db, store.id), getHours(db, store.id), listServices(db, store.id)]);
      const head = `Opening hours (${store.timezone}): ${describeHours(hours)}. Services: ${services.map((v) => `${v.name} ${v.duration_min} min ${v.price_cents ? formatMoney(v.price_cents, store.currency) : "free"}${v.active ? "" : " (hidden)"}`).join("; ") || "none"}.`;
      if (!bookings.length) return { ok: true, output: `${head}\nNo upcoming bookings.` };
      return {
        ok: true,
        output: `${head}\nUpcoming bookings:\n${bookings
          .map((b) => `- ${formatSlot(b.starts_at, store.timezone)} ${b.service_name} for ${b.customer_name} (${b.customer_email}${b.customer_phone ? `, ${b.customer_phone}` : ""})${b.amount_cents ? `, paid ${formatMoney(b.amount_cents, b.currency)}` : ""}${b.note ? `, note: ${b.note}` : ""} [id ${b.id}]`)
          .join("\n")}`,
      };
    }
    case "store_cancel_booking": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const booking = await cancelBooking(await storeDb(store), store.id, String(args?.booking ?? ""));
      if (!booking) return { ok: false, output: "No upcoming booking with that id. Use store_bookings to find it." };
      return {
        ok: true,
        output: `Cancelled ${booking.service_name} on ${formatSlot(booking.starts_at, store.timezone)} for ${booking.customer_name}. Let them know at ${booking.customer_email}.${booking.amount_cents ? " It was paid: refund it in the seller's Stripe dashboard (Payments)." : ""}`,
      };
    }
    case "store_set_shipping": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const patch: Parameters<typeof updateStore>[2] = {};
      if (args?.rates !== undefined) {
        const r = parseShippingRates(args.rates);
        if ("error" in r) return { ok: false, output: r.error };
        patch.shippingRates = r.rates;
      }
      if (args?.ship_from !== undefined) {
        const a = parseAddress(args.ship_from);
        if ("error" in a) return { ok: false, output: a.error };
        patch.shipFrom = a.value;
      }
      if (args?.parcel !== undefined) {
        const p = parseParcel(args.parcel);
        if ("error" in p) return { ok: false, output: p.error };
        patch.defaultParcel = p.value;
      }
      const updated = await updateStore(store.id, userId, patch);
      if (!updated) return { ok: false, output: "The store could not be updated." };
      const rates = (updated.shipping_rates ?? []).map((r) => `${r.name} ${r.amount_cents ? formatMoney(r.amount_cents, updated.currency) : "free"}`).join(", ");
      return {
        ok: true,
        output: `Shipping for ${updated.name}: checkout rates ${rates || "none (customers aren't charged for shipping)"}; ships from ${describeAddress(updated.ship_from)}; default parcel ${updated.default_parcel ? `${updated.default_parcel.length_cm}x${updated.default_parcel.width_cm}x${updated.default_parcel.height_cm} cm, ${updated.default_parcel.weight_kg} kg` : "not set"}.`,
      };
    }
    case "store_shipping_rates":
    case "store_buy_label": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const token = await providerSecret(store.id, "shippo");
      if (!token) return { ok: false, output: "This store has no working Shippo connection. Connect the seller's Shippo account with store_connect first, or use store_mark_shipped with a tracking link from any carrier." };
      const db = await storeDb(store);
      const order = await getOrder(db, store.id, String(args?.order ?? ""));
      if (!order || (order.status !== "paid" && order.status !== "fulfilled")) return { ok: false, output: "No paid order with that id. Use store_orders to find it." };
      if (name === "store_shipping_rates") {
        const to = addressFromStripe(order.shipping, order.customer_email);
        if (!to) return { ok: false, output: "This order has no shipping address (the store may not ask for one at checkout)." };
        if (!store.ship_from) return { ok: false, output: "Set the store's ship-from address first with store_set_shipping." };
        const p = args?.parcel !== undefined ? parseParcel(args.parcel) : store.default_parcel ? { ok: true as const, value: store.default_parcel } : null;
        if (!p) return { ok: false, output: "Give the parcel size and weight, or set a default parcel with store_set_shipping." };
        if ("error" in p) return { ok: false, output: p.error };
        try {
          const rates = (await quoteRates(token, store.ship_from as Address, to, p.value as Parcel)).slice(0, 8);
          if (!rates.length) return { ok: false, output: "Shippo returned no rates for this parcel and route. Check the addresses and carriers enabled in Shippo." };
          return {
            ok: true,
            output: `Rates to ${describeAddress(to)} (prices are what the seller's Shippo account pays):\n${rates
              .map((r) => `- ${r.provider} ${r.servicelevel?.name ?? ""}: ${r.amount} ${r.currency}${r.estimated_days ? `, about ${r.estimated_days} days` : ""} [rate ${r.object_id}]`)
              .join("\n")}\nTo buy one, call store_buy_label with the rate id and its exact price; the user approves the purchase.`,
          };
        } catch (e: any) {
          return { ok: false, output: String(e?.message ?? "Shippo couldn't quote rates.").slice(0, 400) };
        }
      }
      const rateId = String(args?.rate ?? "");
      const rate = await getRate(token, rateId);
      if (!rate) return { ok: false, output: "Shippo doesn't know that rate id. Get fresh rates with store_shipping_rates." };
      if (!samePrice(args?.price, rate.amount)) return { ok: false, output: `That rate now costs ${rate.amount} ${rate.currency}, not ${args?.price}. Show the user the new price and ask again.` };
      try {
        const label = await buyLabel(token, rateId);
        await markOrderShipped(db, store.id, order.id, { carrier: label.carrier || rate.provider, trackingNumber: label.trackingNumber || null, trackingUrl: label.trackingUrl, labelUrl: label.labelUrl });
        if (order.customer_email) {
          await sendStoreShippedEmail(order.customer_email, {
            storeName: store.name,
            lines: (order.items ?? []).map((i) => `${i.quantity} x ${i.name}`),
            carrier: label.carrier || rate.provider,
            trackingNumber: label.trackingNumber || null,
            trackingUrl: label.trackingUrl,
          }, await sellerEmail(store));
        }
        return { ok: true, output: `Label bought (${label.amount} ${label.currency}, ${label.carrier || rate.provider}). Print it: ${label.labelUrl}\nTracking ${label.trackingNumber}${label.trackingUrl ? `: ${label.trackingUrl}` : ""}. The customer was emailed the tracking details.` };
      } catch (e: any) {
        return { ok: false, output: String(e?.message ?? "Shippo couldn't buy the label.").slice(0, 400) };
      }
    }
    case "store_mark_shipped": {
      const store = await findStore(userId, args?.store);
      if (!store) return { ok: false, output: "No store with that slug. Call store_status to see the user's stores." };
      const db = await storeDb(store);
      const order = await getOrder(db, store.id, String(args?.order ?? ""));
      if (!order || (order.status !== "paid" && order.status !== "fulfilled")) return { ok: false, output: "No paid order with that id. Use store_orders to find it." };
      let trackingUrl: string | null = null;
      if (typeof args?.tracking_url === "string" && args.tracking_url.trim()) {
        try {
          const u = new URL(args.tracking_url.trim());
          if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad");
          trackingUrl = u.toString();
        } catch {
          return { ok: false, output: "The tracking link must be a web address." };
        }
      }
      const carrier = typeof args?.carrier === "string" ? args.carrier.trim().slice(0, 60) || null : null;
      const trackingNumber = typeof args?.tracking_number === "string" ? args.tracking_number.trim().slice(0, 80) || null : null;
      await markOrderShipped(db, store.id, order.id, { carrier, trackingNumber, trackingUrl, labelUrl: null });
      if (order.customer_email) {
        await sendStoreShippedEmail(order.customer_email, {
          storeName: store.name, lines: (order.items ?? []).map((i) => `${i.quantity} x ${i.name}`), carrier, trackingNumber, trackingUrl,
        }, await sellerEmail(store));
      }
      return { ok: true, output: `Marked the order as shipped${order.customer_email ? " and emailed the customer" : ""}.` };
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
