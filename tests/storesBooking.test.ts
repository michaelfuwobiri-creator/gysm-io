import { describe, expect, it } from "vitest";
import {
  addDays, computeSlots, describeHours, formatSlot, isIsoDate, isValidTimeZone, parseBookingInput, parseHHMM,
  parseHoursInput, parseServiceInput, todayIn, tzOffsetMinutes, weekdayOf, zonedToUtc,
} from "@/lib/stores/booking";

describe("times and zones", () => {
  it("parses HH:MM", () => {
    expect(parseHHMM("09:30")).toBe(570);
    expect(parseHHMM("24:00")).toBe(1440);
    expect(parseHHMM("24:30")).toBeNull();
    expect(parseHHMM("9.30")).toBeNull();
  });
  it("knows time zones", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
  it("converts local time to UTC across daylight saving", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/Rome")).toBe(60);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/Rome")).toBe(120);
    expect(zonedToUtc("2026-01-15", 9 * 60, "Europe/Rome").toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedToUtc("2026-07-15", 9 * 60, "Europe/Rome").toISOString()).toBe("2026-07-15T07:00:00.000Z");
    expect(zonedToUtc("2026-07-15", 9 * 60, "Africa/Lagos").toISOString()).toBe("2026-07-15T08:00:00.000Z");
  });
  it("handles dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-16")).toBe(true);
    expect(weekdayOf("2026-11-16")).toBe(1); // Monday
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(todayIn("Europe/Rome", new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
  });
});

describe("opening hours", () => {
  it("parses a week", () => {
    const r = parseHoursInput([{ day: "Monday", open: "09:00", close: "17:00" }, { day: "sat", open: "10:00", close: "13:00" }]);
    expect(r).toEqual({ ok: true, rows: [{ weekday: 1, open_min: 540, close_min: 1020 }, { weekday: 6, open_min: 600, close_min: 780 }] });
    if ("rows" in r) expect(describeHours(r.rows)).toBe("mon 09:00-17:00, sat 10:00-13:00");
  });
  it("rejects bad hours", () => {
    expect(parseHoursInput([{ day: "funday", open: "09:00", close: "17:00" }]).ok).toBe(false);
    expect(parseHoursInput([{ day: "mon", open: "17:00", close: "09:00" }]).ok).toBe(false);
    expect(parseHoursInput([{ day: "mon", open: "09:00", close: "12:00" }, { day: "mon", open: "13:00", close: "17:00" }]).ok).toBe(false);
    expect(parseHoursInput("mon").ok).toBe(false);
  });
});

describe("slots", () => {
  const hours = [{ weekday: 1, open_min: 540, close_min: 720 }]; // Mondays 09:00-12:00
  const now = new Date("2026-11-13T10:00:00Z"); // Friday
  it("lists free starts inside opening hours", () => {
    const slots = computeSlots({ date: "2026-11-16", timezone: "Europe/Rome", hours, durationMin: 60, busy: [], now });
    expect(slots.map((s) => formatSlot(s, "Europe/Rome"))).toEqual([
      "Mon 16 Nov, 09:00", "Mon 16 Nov, 09:30", "Mon 16 Nov, 10:00", "Mon 16 Nov, 10:30", "Mon 16 Nov, 11:00",
    ]);
  });
  it("skips busy times, closed days, the past and the far future", () => {
    const busy = [{ start: new Date("2026-11-16T09:00:00Z"), end: new Date("2026-11-16T10:00:00Z") }]; // 10:00-11:00 Rome
    const slots = computeSlots({ date: "2026-11-16", timezone: "Europe/Rome", hours, durationMin: 60, busy, now });
    expect(slots.map((s) => formatSlot(s, "Europe/Rome").slice(-5))).toEqual(["09:00", "11:00"]);
    expect(computeSlots({ date: "2026-11-17", timezone: "Europe/Rome", hours, durationMin: 60, busy: [], now })).toEqual([]);
    expect(computeSlots({ date: "2026-11-09", timezone: "Europe/Rome", hours, durationMin: 60, busy: [], now })).toEqual([]);
    expect(computeSlots({ date: "2027-03-01", timezone: "Europe/Rome", hours, durationMin: 60, busy: [], now })).toEqual([]);
  });
  it("keeps a lead time before the first slot today", () => {
    const today = [{ weekday: 5, open_min: 600, close_min: 780 }]; // Fridays 10:00-13:00
    const slots = computeSlots({ date: "2026-11-13", timezone: "Europe/Rome", hours: today, durationMin: 30, busy: [], now });
    expect(formatSlot(slots[0], "Europe/Rome").slice(-5)).toBe("12:00"); // now is 11:00 Rome, plus 60 minutes
  });
});

describe("service and booking input", () => {
  it("accepts free and paid services", () => {
    expect(parseServiceInput({ name: "Haircut", duration_min: 45, price: "25" })).toMatchObject({ ok: true, value: { priceCents: 2500, durationMin: 45 } });
    expect(parseServiceInput({ name: "Intro call", duration_min: 15 })).toMatchObject({ ok: true, value: { priceCents: 0 } });
    expect(parseServiceInput({ name: "X", duration_min: 7 }).ok).toBe(false);
    expect(parseServiceInput({ name: "X", duration_min: 30, price: "0.10" }).ok).toBe(false);
  });
  it("checks customer details", () => {
    expect(parseBookingInput({ name: "Ada", email: "ada@example.com" })).toMatchObject({ ok: true, value: { phone: null } });
    expect(parseBookingInput({ name: "", email: "ada@example.com" }).ok).toBe(false);
    expect(parseBookingInput({ name: "Ada", email: "nope" }).ok).toBe(false);
    expect(parseBookingInput({ name: "Ada", email: "ada@example.com", phone: "abc" }).ok).toBe(false);
  });
});
