// GYSM Stores bookings: pure helpers for opening hours, time zones and free
// slots. No database or network, so everything here is unit tested.

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const BOOKING_DAYS_AHEAD = 60;
export const MIN_LEAD_MINUTES = 60;
/** An unpaid booking holds its slot this long while the customer is on Stripe's page. */
export const PENDING_HOLD_MINUTES = 35;

export type HoursRow = { weekday: number; open_min: number; close_min: number };
export type Busy = { start: Date; end: Date };

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "09:30" -> 570. null when invalid. "24:00" is allowed as an end time. */
export function parseHHMM(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export function formatHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** [{day:"mon", open:"09:00", close:"17:00"}, ...] -> rows. One opening window per day; days left out are closed. */
export function parseHoursInput(input: unknown): { ok: true; rows: HoursRow[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Send the opening hours as a list of days." };
  const rows: HoursRow[] = [];
  const seen = new Set<number>();
  for (const item of input) {
    const day = typeof item?.day === "string" ? item.day.trim().toLowerCase().slice(0, 3) : "";
    const weekday = (WEEKDAYS as readonly string[]).indexOf(day);
    if (weekday < 0) return { ok: false, error: `Unknown day "${item?.day}". Use mon, tue, wed, thu, fri, sat or sun.` };
    if (seen.has(weekday)) return { ok: false, error: `${WEEKDAYS[weekday]} is listed twice. Give one opening window per day.` };
    const open = parseHHMM(item?.open);
    const close = parseHHMM(item?.close);
    if (open === null || close === null) return { ok: false, error: `Times for ${WEEKDAYS[weekday]} must look like 09:00.` };
    if (close <= open) return { ok: false, error: `On ${WEEKDAYS[weekday]} the closing time must be after the opening time.` };
    seen.add(weekday);
    rows.push({ weekday, open_min: open, close_min: close });
  }
  return { ok: true, rows: rows.sort((a, b) => a.weekday - b.weekday) };
}

export function describeHours(rows: HoursRow[]): string {
  if (!rows.length) return "closed every day (no opening hours set)";
  return rows.map((r) => `${WEEKDAYS[r.weekday]} ${formatHHMM(r.open_min)}-${formatHHMM(r.close_min)}`).join(", ");
}

/** Minutes the time zone is ahead of UTC at that instant (Rome in winter: 60). */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Local wall-clock time on a date in a time zone -> the real instant. */
export function zonedToUtc(date: string, minutes: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = tzOffsetMinutes(new Date(guess), tz);
  let t = guess - first * 60000;
  const second = tzOffsetMinutes(new Date(t), tz);
  if (second !== first) t = guess - second * 60000;
  return new Date(t);
}

/** "YYYY-MM-DD" that it currently is in the time zone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Free start times (ISO strings) for one service on one local date: inside the
 * opening window, not overlapping a busy booking, at least MIN_LEAD_MINUTES
 * from now, and no further than BOOKING_DAYS_AHEAD days out.
 */
export function computeSlots(opts: {
  date: string;
  timezone: string;
  hours: HoursRow[];
  durationMin: number;
  busy: Busy[];
  now?: Date;
  stepMin?: number;
}): string[] {
  const now = opts.now ?? new Date();
  if (!isIsoDate(opts.date)) return [];
  const today = todayIn(opts.timezone, now);
  if (opts.date < today || opts.date > addDays(today, BOOKING_DAYS_AHEAD)) return [];
  const window = opts.hours.find((h) => h.weekday === weekdayOf(opts.date));
  if (!window || opts.durationMin <= 0) return [];
  const step = opts.stepMin ?? (opts.durationMin < 30 ? 15 : 30);
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60000;
  const out: string[] = [];
  for (let start = window.open_min; start + opts.durationMin <= window.close_min; start += step) {
    const s = zonedToUtc(opts.date, start, opts.timezone);
    const e = new Date(s.getTime() + opts.durationMin * 60000);
    if (s.getTime() < earliest) continue;
    if (opts.busy.some((b) => s < b.end && e > b.start)) continue;
    out.push(s.toISOString());
  }
  return out;
}

export function formatSlot(iso: string, tz: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export type ServiceInput = { name: string; description: string; durationMin: number; priceCents: number; active: boolean };

/** Price "" or 0 means free; otherwise at least 0.50. Duration 5-480 minutes in steps of 5. */
export function parseServiceInput(body: any): { ok: true; value: ServiceInput } | { ok: false; error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 120) return { ok: false, error: "Give the service a name (up to 120 characters)." };
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const durationMin = Number(body?.duration_min ?? body?.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480 || durationMin % 5 !== 0) {
    return { ok: false, error: "Duration must be 5 to 480 minutes, in steps of 5." };
  }
  let priceCents = 0;
  const raw = body?.price;
  if (raw !== undefined && raw !== null && raw !== "" && Number(String(raw).replace(",", ".")) !== 0) {
    const text = String(raw).trim().replace(",", ".");
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(text)) return { ok: false, error: "Enter a price like 25 or 25.50, or 0 for free." };
    const [w, f = ""] = text.split(".");
    priceCents = Number(w) * 100 + Number(f.padEnd(2, "0"));
    if (priceCents < 50) return { ok: false, error: "Paid services must cost at least 0.50 (or 0 for free)." };
  }
  const active = body?.active === undefined ? true : Boolean(body.active);
  return { ok: true, value: { name, description, durationMin, priceCents, active } };
}

export type BookingInput = { name: string; email: string; phone: string | null; note: string };

export function parseBookingInput(body: any): { ok: true; value: BookingInput } | { ok: false; error: string } {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return { ok: false, error: "Enter your name." };
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Enter a valid email address." };
  const phoneRaw = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (phoneRaw && !/^[+\d][\d\s()-]{5,24}$/.test(phoneRaw)) return { ok: false, error: "Enter a valid phone number, or leave it empty." };
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";
  return { ok: true, value: { name, email, phone: phoneRaw || null, note } };
}
