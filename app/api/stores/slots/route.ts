import { storesEnabled } from "@/lib/stores/core";
import { BOOKING_DAYS_AHEAD, PENDING_HOLD_MINUTES, addDays, computeSlots, isIsoDate, zonedToUtc } from "@/lib/stores/booking";
import { busyBetween, getHours, getStoreBySlug, isUuid, listServices } from "@/lib/stores/db";
import { storeDb } from "@/lib/stores/connections";
import { json } from "@/lib/stores/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: free start times for one service on one date. */
export async function GET(req: Request) {
  if (!storesEnabled()) return json({ error: "Not found" }, 404);
  const q = new URL(req.url).searchParams;
  const slug = q.get("slug") ?? "";
  const serviceId = q.get("service") ?? "";
  const date = q.get("date") ?? "";
  if (!isUuid(serviceId) || !isIsoDate(date)) return json({ error: "Pick a service and a date." }, 400);
  const store = await getStoreBySlug(slug);
  if (!store || store.status !== "live") return json({ error: "Store not found." }, 404);
  const db = await storeDb(store);
  const service = (await listServices(db, store.id, { activeOnly: true })).find((s) => s.id === serviceId);
  if (!service) return json({ error: "That service isn't available." }, 404);
  const from = zonedToUtc(date, 0, store.timezone);
  const to = zonedToUtc(addDays(date, 1), 0, store.timezone);
  const [hours, busy] = await Promise.all([getHours(db, store.id), busyBetween(db, store.id, from, to, PENDING_HOLD_MINUTES)]);
  const slots = computeSlots({ date, timezone: store.timezone, hours, durationMin: service.duration_min, busy });
  return json({ slots, timezone: store.timezone, daysAhead: BOOKING_DAYS_AHEAD });
}
