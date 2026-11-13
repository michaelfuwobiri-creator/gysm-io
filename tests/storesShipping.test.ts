import { describe, expect, it } from "vitest";
import { addressFromStripe, describeAddress, parseAddress, parseParcel, parseShippingRates, samePrice } from "@/lib/stores/shipping";

describe("shipping helpers", () => {
  it("parses checkout rates", () => {
    expect(parseShippingRates([{ name: "Standard", price: "4,90" }, { name: "Pickup", price: "0" }])).toEqual({
      ok: true, rates: [{ name: "Standard", amount_cents: 490 }, { name: "Pickup", amount_cents: 0 }],
    });
    expect(parseShippingRates([{ name: "", price: "5" }]).ok).toBe(false);
    expect(parseShippingRates([{ name: "X", price: "abc" }]).ok).toBe(false);
    expect(parseShippingRates(Array(6).fill({ name: "X", price: "1" })).ok).toBe(false);
  });
  it("checks addresses and parcels", () => {
    expect(parseAddress({ name: "Mia", street: "Via Roma 1", city: "Roma", zip: "00100", country: "it" })).toMatchObject({ ok: true, value: { country: "IT", street1: "Via Roma 1" } });
    expect(parseAddress({ name: "Mia", street: "Via Roma 1", city: "Roma", zip: "00100", country: "Italy" }).ok).toBe(false);
    expect(parseParcel({ length_cm: 20, width_cm: 15, height_cm: 10, weight_kg: 1.2 }).ok).toBe(true);
    expect(parseParcel({ length_cm: 20, width_cm: 15, height_cm: 10, weight_kg: 0 }).ok).toBe(false);
  });
  it("turns Stripe shipping details into an address", () => {
    const a = addressFromStripe({ name: "Ada", address: { line1: "1 High St", city: "Lagos", postal_code: "100001", country: "NG" } }, "ada@example.com");
    expect(describeAddress(a)).toBe("Ada, 1 High St, 100001 Lagos, NG");
    expect(addressFromStripe(null, null)).toBeNull();
  });
  it("compares the approved price with the quoted one", () => {
    expect(samePrice("7.40 EUR", "7.40")).toBe(true);
    expect(samePrice("€7,40", "7.40")).toBe(true);
    expect(samePrice("7.00", "7.40")).toBe(false);
  });
});
