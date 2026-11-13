import { storeCanSell, storesEnabled } from "@/lib/stores/core";
import { PENDING_HOLD_MINUTES, addDays, computeSlots, formatSlot, parseBookingInput, todayIn, zonedToUtc } from "@/lib/stores/booking";
import { attachSessionToBooking, busyBetween, createBooking, expireBooking, getHours, getStoreBySlug, isUuid, listServices } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import { createBookingCheckout } from "@/lib/stores/payments";
import { notifyBooking } from "@/lib/stores/notify";
import { json, readJson } from "@/lib/stores/api";

export const runtime = "nodejs";

/** Public: book a slot. Free services are confirmed at once; paid ones go to Stripe on the seller's account. */
export async function POST(req: Request) {
  if (!storesEnabled()) return json({ error: "Not found" }, 404);
  const body = await readJson(req);
  const store = typeof body?.slug === "string" ? await getStoreBySlug(body.slug) : null;
  if (!store || store.status !== "live") return json({ error: "Store not found." }, 404);
  const customer = parseBookingInput(body);
  if ("error" in customer) return json({ error: customer.error }, 400);
  const db = await storeDb(store);
  const service = isUuid(body?.serviceId ?? "") ? (await listServices(db, store.id, { activeOnly: true })).find((s) => s.id === body.serviceId) : null;
  if (!service) return json({ error: "That service isn't available." }, 404);
  if (service.price_cents > 0 && !storeCanSell(store)) return json({ error: "This store can't take payments right now." }, 409);

  // The requested time must still be one of the free slots for its local date.
  const start = new Date(typeof body?.start === "string" ? body.start : "");
  if (Number.isNaN(start.getTime())) return json({ error: "Pick a time." }, 400);
  const date = todayIn(store.timezone, start);
  const from = zonedToUtc(date, 0, store.timezone);
  const to = zonedToUtc(addDays(date, 1), 0, store.timezone);
  const [hours, busy] = await Promise.all([getHours(db, store.id), busyBetween(db, store.id, from, to, PENDING_HOLD_MINUTES)]);
  const free = computeSlots({ date, timezone: store.timezone, hours, durationMin: service.duration_min, busy });
  if (!free.includes(start.toISOString())) return json({ error: "That time was just taken or isn't available. Pick another." }, 409);

  const paid = service.price_cents > 0;
  const booking = await createBooking(db, {
    storeId: store.id, service, start, currency: store.currency, status: paid ? "pending" : "confirmed",
    customer: customer.value, holdMinutes: PENDING_HOLD_MINUTES,
  });
  if (!booking) return json({ error: "That time was just taken. Pick another." }, 409);

  if (!paid) {
    await notifyBooking(store, booking);
    return json({ confirmed: true, when: formatSlot(booking.starts_at, store.timezone) });
  }
  try {
    const session = await createBookingCheckout(store, booking, formatSlot(booking.starts_at, store.timezone));
    await attachSessionToBooking(db, booking.id, session.id);
    return json({ url: session.url });
  } catch (e: any) {
    console.error("[stores/book] Stripe session failed:", e?.message || e);
    await expireBooking(db, booking.id);
    return json({ error: "Payments are unavailable for this store right now. Please try again later." }, 502);
  }
}
