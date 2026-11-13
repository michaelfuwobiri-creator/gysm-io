// GYSM Stores shipping: flat rates the customer picks at checkout, and the
// details Shippo needs to quote and buy a label after an order is paid. Pure.

export type ShippingRate = { name: string; amount_cents: number };
export type Address = { name: string; street1: string; street2?: string; city: string; state?: string; zip: string; country: string; phone?: string; email?: string };
export type Parcel = { length_cm: number; width_cm: number; height_cm: number; weight_kg: number };

const COUNTRY_RE = /^[A-Z]{2}$/;

/** [{name:"Standard", price:"5"}, ...] -> rates in cents. Up to 5; a price of 0 is "Free shipping". */
export function parseShippingRates(input: unknown): { ok: true; rates: ShippingRate[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Send shipping rates as a list like [{name: \"Standard\", price: \"5\"}]." };
  if (input.length > 5) return { ok: false, error: "Use at most 5 shipping rates." };
  const rates: ShippingRate[] = [];
  for (const r of input) {
    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (!name || name.length > 60) return { ok: false, error: "Each shipping rate needs a name (up to 60 characters)." };
    const text = String(r?.price ?? "").trim().replace(",", ".");
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) return { ok: false, error: `Price for "${name}" should look like 5 or 4.90 (0 for free).` };
    const [w, f = ""] = text.split(".");
    rates.push({ name, amount_cents: Number(w) * 100 + Number(f.padEnd(2, "0")) });
  }
  return { ok: true, rates };
}

/** A ship-from address. Country is a 2-letter code (IT, NG, GB...). */
export function parseAddress(input: any): { ok: true; value: Address } | { ok: false; error: string } {
  const s = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const value: Address = {
    name: s(input?.name),
    street1: s(input?.street1 ?? input?.street),
    street2: s(input?.street2) || undefined,
    city: s(input?.city, 60),
    state: s(input?.state, 40) || undefined,
    zip: s(input?.zip ?? input?.postal_code, 20),
    country: s(input?.country, 10).toUpperCase(),
    phone: s(input?.phone, 30) || undefined,
    email: s(input?.email, 120) || undefined,
  };
  if (!value.name || !value.street1 || !value.city || !value.zip) return { ok: false, error: "The ship-from address needs a name, street, city and postal code." };
  if (!COUNTRY_RE.test(value.country)) return { ok: false, error: "Country must be a 2-letter code like IT or NG." };
  return { ok: true, value };
}

export function parseParcel(input: any): { ok: true; value: Parcel } | { ok: false; error: string } {
  const n = (v: unknown) => Number(v);
  const value = { length_cm: n(input?.length_cm), width_cm: n(input?.width_cm), height_cm: n(input?.height_cm), weight_kg: n(input?.weight_kg) };
  for (const [k, v] of Object.entries(value)) {
    if (!Number.isFinite(v) || v <= 0 || v > (k === "weight_kg" ? 70 : 300)) return { ok: false, error: "Give the parcel size in cm (up to 300) and weight in kg (up to 70)." };
  }
  return { ok: true, value };
}

/** Stripe's collected shipping details -> a Shippo address for the customer. */
export function addressFromStripe(shipping: any, email: string | null): Address | null {
  const a = shipping?.address;
  if (!a?.line1 || !a?.city || !a?.country) return null;
  return {
    name: String(shipping?.name ?? "Customer"),
    street1: String(a.line1),
    street2: a.line2 ? String(a.line2) : undefined,
    city: String(a.city),
    state: a.state ? String(a.state) : undefined,
    zip: String(a.postal_code ?? ""),
    country: String(a.country).toUpperCase(),
    phone: shipping?.phone ? String(shipping.phone) : undefined,
    email: email ?? undefined,
  };
}

export function describeAddress(a: Address | null | undefined): string {
  if (!a) return "not set";
  return [a.name, a.street1, a.street2, `${a.zip} ${a.city}`.trim(), a.state, a.country].filter(Boolean).join(", ");
}

/** "€4.90" style price check: the price the user approved must match the quoted rate. */
export function samePrice(approved: unknown, quoted: string): boolean {
  const a = Number(String(approved ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  const q = Number(quoted);
  return Number.isFinite(a) && Number.isFinite(q) && Math.abs(a - q) < 0.005;
}
