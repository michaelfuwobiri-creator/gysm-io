// Who hears about what: the seller gets an email for every paid order and every
// booking; the customer gets a booking confirmation (replies go to the seller).
import { sql } from "@/lib/db";
import { sendStoreBookingEmail } from "@/lib/email/send";
import { formatMoney, storeUrl } from "./core";
import { formatSlot } from "./booking";
import type { BookingRow, StoreRow } from "./db";

export async function sellerEmail(store: StoreRow): Promise<string | null> {
  if (store.notify_email) return store.notify_email;
  try {
    const rows = await sql`select email from users where clerk_id = ${store.user_id} limit 1`;
    return ((rows[0] as any)?.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function notifyBooking(store: StoreRow, booking: BookingRow): Promise<void> {
  const when = `${formatSlot(booking.starts_at, store.timezone)} (${store.timezone})`;
  const paid = booking.amount_cents > 0 ? formatMoney(booking.amount_cents, booking.currency) : null;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io").replace(/\/+$/, "");
  const seller = await sellerEmail(store);
  const customer = [booking.customer_name, booking.customer_email, booking.customer_phone].filter(Boolean).join(", ");
  const base = { storeName: store.name, serviceName: booking.service_name, when, paid, note: booking.note };
  if (seller) await sendStoreBookingEmail(seller, { ...base, audience: "seller", customer, url: `${site}/agent` });
  await sendStoreBookingEmail(booking.customer_email, { ...base, audience: "customer", customer, url: storeUrl(store.slug) }, seller);
}
