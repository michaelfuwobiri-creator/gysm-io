// GYSM Stores: pure helpers with no database, Stripe or env access at import
// time, so they can be unit tested and imported from client components.

export const SUPPORTED_CURRENCIES = ["eur", "usd", "gbp"] as const;
export type StoreCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const MAX_QUANTITY = 99;
export const MAX_CART_LINES = 50;
export const MIN_PRICE_CENTS = 50; // Stripe's minimum charge is about 0.50 in EUR/USD/GBP
export const MAX_PRICE_CENTS = 99_999_999;

const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "shop", "store", "stores", "gysm", "mail", "email",
  "help", "support", "dashboard", "login", "signin", "signup", "billing", "status", "docs",
]);

/** Feature flag: everything under GYSM Stores is off unless STORES_ENABLED is "true". */
export function storesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STORES_ENABLED === "true";
}

export function isSupportedCurrency(value: unknown): value is StoreCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

/** Why a slug can't be used, or null when it can. Slugs become <slug>.gysm.store. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 characters.";
  if (slug.length > 40) return "Use at most 40 characters.";
  if (!/^[a-z0-9-]+$/.test(slug)) return "Use only lowercase letters, numbers and hyphens.";
  if (slug.startsWith("-") || slug.endsWith("-") || slug.includes("--")) return "Hyphens can't start, end or repeat.";
  if (RESERVED_SLUGS.has(slug)) return "That name is reserved.";
  return null;
}

/** A best-effort slug suggestion from a store name ("Mia's Bakery!" -> "mias-bakery"). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** "12.50", "12,50", "12" or 12.5 -> 1250. Returns null for anything that isn't a valid price. */
export function parsePriceToCents(input: unknown): number | null {
  let text: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    text = input.toFixed(2);
  } else if (typeof input === "string") {
    text = input.trim().replace(",", ".");
  } else {
    return null;
  }
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

export function formatMoney(cents: number, currency: string, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export type ProductInput = {
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string | null;
  stock: number | null;
  active: boolean;
};

/** Validates a product form body. Returns the clean product or an error message. */
export function parseProductInput(body: any): { ok: true; value: ProductInput } | { ok: false; error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return { ok: false, error: "Give the product a name (up to 120 characters)." };
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const priceCents = parsePriceToCents(body?.price);
  if (priceCents === null) return { ok: false, error: "Enter a price between 0.50 and 999,999.99." };
  let imageUrl: string | null = null;
  if (typeof body?.imageUrl === "string" && body.imageUrl.trim()) {
    try {
      const u = new URL(body.imageUrl.trim());
      if (u.protocol !== "https:") throw new Error("not https");
      imageUrl = u.toString();
    } catch {
      return { ok: false, error: "The image link must start with https://." };
    }
  }
  let stock: number | null = null;
  if (body?.stock !== undefined && body?.stock !== null && body?.stock !== "") {
    const n = Number(body.stock);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { ok: false, error: "Stock must be a whole number, or empty for unlimited." };
    stock = n;
  }
  const active = body?.active === undefined ? true : Boolean(body.active);
  return { ok: true, value: { name, description, priceCents, imageUrl, stock, active } };
}

export type CatalogProduct = {
  id: string;
  name: string;
  price_cents: number;
  image_url: string | null;
  stock: number | null;
  active: boolean;
};

export type CartLine = { product: CatalogProduct; quantity: number; lineTotalCents: number };

/**
 * Turns what the browser sent ({productId, quantity}[]) into priced lines using
 * only the server's own catalogue. Prices from the client are never trusted.
 */
export function priceCart(
  items: unknown,
  catalog: CatalogProduct[],
): { ok: true; lines: CartLine[]; totalCents: number } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "Your cart is empty." };
  if (items.length > MAX_CART_LINES) return { ok: false, error: "Too many items in the cart." };
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const merged = new Map<string, number>();
  for (const raw of items) {
    const id = typeof raw?.productId === "string" ? raw.productId : "";
    const qty = Number(raw?.quantity);
    if (!id || !Number.isInteger(qty) || qty < 1) return { ok: false, error: "A cart item is invalid." };
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }
  const lines: CartLine[] = [];
  let totalCents = 0;
  for (const [id, quantity] of Array.from(merged)) {
    const product = byId.get(id);
    if (!product || !product.active) return { ok: false, error: "An item in your cart is no longer for sale." };
    if (quantity > MAX_QUANTITY) return { ok: false, error: `You can buy at most ${MAX_QUANTITY} of "${product.name}".` };
    if (product.stock !== null && quantity > product.stock) {
      return { ok: false, error: product.stock === 0 ? `"${product.name}" is sold out.` : `Only ${product.stock} of "${product.name}" left.` };
    }
    const lineTotalCents = product.price_cents * quantity;
    totalCents += lineTotalCents;
    lines.push({ product, quantity, lineTotalCents });
  }
  return { ok: true, lines, totalCents };
}

/**
 * <slug>.gysm.store (or www.<slug>.gysm.store) -> slug. null for the bare root
 * domain, its www, other hosts, or when STORES_ROOT_DOMAIN is not set.
 */
export function storeSlugFromHost(host: string, rootDomain: string | undefined): string | null {
  if (!rootDomain) return null;
  const root = rootDomain.toLowerCase().replace(/^\.+|\.+$/g, "");
  const bare = host.split(":")[0].toLowerCase();
  if (!bare.endsWith(`.${root}`)) return null;
  let sub = bare.slice(0, -(root.length + 1));
  if (sub.startsWith("www.")) sub = sub.slice(4);
  if (!sub || sub === "www" || sub.includes(".")) return null;
  return slugProblem(sub) === null ? sub : null;
}

/** A store takes orders only once its owner has published it and Stripe has enabled charges. */
export function storeCanSell(store: { status: string; stripe_charges_enabled: boolean }): boolean {
  return store.status === "live" && store.stripe_charges_enabled;
}

/** The public address of a store: <slug>.gysm.store when configured, else <site>/shop/<slug>. */
export function storeUrl(slug: string, env: Record<string, string | undefined> = process.env): string {
  const root = env.STORES_ROOT_DOMAIN || env.NEXT_PUBLIC_STORES_ROOT_DOMAIN;
  if (root) return `https://${slug}.${root}`;
  const app = (env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io").replace(/\/+$/, "");
  return `${app}/shop/${slug}`;
}
