// Minimal Shippo client for GYSM Stores: quote rates for a parcel and buy a
// label, with the seller's own API token. Calls only api.goshippo.com.
import type { Address, Parcel } from "./shipping";

const BASE = "https://api.goshippo.com";

export type ShippoRate = { object_id: string; provider: string; servicelevel: { name: string }; amount: string; currency: string; estimated_days: number | null };

async function shippo(token: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `ShippoToken ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data === "object" ? JSON.stringify(data).slice(0, 300) : "";
    throw new Error(`Shippo answered ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return data;
}

function toShippoAddress(a: Address) {
  return { name: a.name, street1: a.street1, street2: a.street2, city: a.city, state: a.state, zip: a.zip, country: a.country, phone: a.phone, email: a.email };
}

/** Creates a shipment (free) and returns its rates, cheapest first. */
export async function quoteRates(token: string, from: Address, to: Address, parcel: Parcel): Promise<ShippoRate[]> {
  const shipment = await shippo(token, "/shipments/", {
    address_from: toShippoAddress(from),
    address_to: toShippoAddress(to),
    parcels: [{ length: parcel.length_cm, width: parcel.width_cm, height: parcel.height_cm, distance_unit: "cm", weight: parcel.weight_kg, mass_unit: "kg" }],
    async: false,
  });
  const rates: ShippoRate[] = Array.isArray(shipment?.rates) ? shipment.rates : [];
  return rates.sort((a, b) => Number(a.amount) - Number(b.amount));
}

export type ShippoLabel = { trackingNumber: string; trackingUrl: string | null; labelUrl: string; carrier: string; amount: string; currency: string };

/** Buys the label for a rate. This is charged to the seller's Shippo account. */
export async function buyLabel(token: string, rateId: string): Promise<ShippoLabel> {
  if (!/^[a-f0-9]{32}$/i.test(rateId)) throw new Error("That isn't a Shippo rate id.");
  const tx = await shippo(token, "/transactions/", { rate: rateId, label_file_type: "PDF", async: false });
  if (tx?.status !== "SUCCESS") {
    const msgs = Array.isArray(tx?.messages) ? tx.messages.map((m: any) => m?.text).filter(Boolean).join("; ") : "";
    throw new Error(`Shippo couldn't create the label${msgs ? `: ${msgs}` : ""}.`);
  }
  return {
    trackingNumber: String(tx.tracking_number ?? ""),
    trackingUrl: tx.tracking_url_provider ? String(tx.tracking_url_provider) : null,
    labelUrl: String(tx.label_url ?? ""),
    carrier: String(tx.rate?.provider ?? tx.provider ?? ""),
    amount: String(tx.rate?.amount ?? ""),
    currency: String(tx.rate?.currency ?? ""),
  };
}

/** The rate's details (amount, carrier) so the approved price can be checked before buying. */
export async function getRate(token: string, rateId: string): Promise<ShippoRate | null> {
  if (!/^[a-f0-9]{32}$/i.test(rateId)) return null;
  const res = await fetch(`${BASE}/rates/${rateId}`, { headers: { Authorization: `ShippoToken ${token}` }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as ShippoRate;
}
