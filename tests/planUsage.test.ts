import { afterEach, describe, expect, it, vi } from "vitest";
const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ sql: (...a: any[]) => sqlMock(...a) }));
vi.mock("@/lib/unlimited", () => ({ isUnlimitedUser: vi.fn(async () => false) }));
import { creditsToPercent, untilText, usageFromRow } from "@/lib/planUsage";
import { getCreditBalance, deductCredit, chargeCredits } from "@/lib/credits";
import {
  PLAN_WINDOW_LIMIT_CREDITS as WIN,
  PLAN_WEEKLY_LIMIT_CREDITS as WEEK,
  PLAN_WINDOW_LIMIT_USD,
  PLAN_WEEKLY_LIMIT_USD,
  agentCreditsForUsage,
} from "@/lib/credits-constants";

const H = 3600_000;
afterEach(() => sqlMock.mockReset());

describe("plan limits", () => {
  it("fit the EUR 10/month AI budget", () => {
    expect(PLAN_WEEKLY_LIMIT_USD).toBeCloseTo(2.49, 2);
    expect(PLAN_WINDOW_LIMIT_USD).toBeCloseTo(1.0, 2);
    expect(WEEK).toBeGreaterThan(WIN);
    expect((PLAN_WEEKLY_LIMIT_USD * 52) / 12).toBeLessThanOrEqual(10.8);
  });
});

describe("usageFromRow", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  it("counts a running window and week", () => {
    const u = usageFromRow({ window_start: new Date(now - 2 * H).toISOString(), window_used: 1000, week_start: new Date(now - 48 * H).toISOString(), week_used: 5000 }, now);
    expect(u.windowUsed).toBe(1000);
    expect(u.weekUsed).toBe(5000);
    expect(u.windowResetsAt).toBe(new Date(now + 3 * H).toISOString());
    expect(u.remaining).toBe(Math.min(WIN - 1000, WEEK - 5000));
  });
  it("resets an ended window but keeps the week", () => {
    const u = usageFromRow({ window_start: new Date(now - 6 * H).toISOString(), window_used: 7000, week_start: new Date(now - 6 * H).toISOString(), week_used: 7000 }, now);
    expect(u.windowUsed).toBe(0);
    expect(u.windowResetsAt).toBeNull();
    expect(u.weekUsed).toBe(7000);
  });
  it("lets the weekly cap win when it is tighter", () => {
    const u = usageFromRow({ window_start: null, window_used: 0, week_start: new Date(now - H).toISOString(), week_used: WEEK - 10 }, now);
    expect(u.remaining).toBe(10);
  });
  it("starts fresh with no row", () => {
    expect(usageFromRow(null, now).remaining).toBe(Math.min(WIN, WEEK));
  });
});

describe("helpers", () => {
  it("formats time until a reset", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    expect(untilText(new Date(now + 30 * 60000).toISOString(), now)).toBe("30 min");
    expect(untilText(new Date(now + 134 * 60000).toISOString(), now)).toBe("2 h 14 min");
    expect(untilText(new Date(now + 5 * 86400000).toISOString(), now)).toBe("5 days");
  });
  it("turns credits into a percent of a window", () => {
    expect(creditsToPercent(WIN)).toBe(100);
    expect(creditsToPercent(WIN * 2)).toBe(100);
    expect(creditsToPercent(0)).toBe(0);
  });
  it("charges cached prompt tokens at the discounted rate", () => {
    const full = agentCreditsForUsage({ prompt_tokens: 30000, completion_tokens: 500 });
    const cached = agentCreditsForUsage({ prompt_tokens: 30000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 28000 } });
    expect(cached).toBeLessThan(full / 3);
  });
});

// Routes the mocked sql by query text so the credits layer can be exercised.
function db(opts: { plan?: string | null; status?: string; usage?: any; balance?: number }) {
  sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
    const q = strings.join("?");
    if (q.includes("from subscriptions")) return opts.plan ? [{ plan: opts.plan, status: opts.status ?? "active" }] : [];
    if (q.includes("from plan_usage")) return opts.usage ? [opts.usage] : [];
    if (q.includes("insert into plan_usage")) return [{ window_start: new Date().toISOString(), window_used: 100, week_start: new Date().toISOString(), week_used: 100 }];
    if (q.includes("select balance from credits")) return [{ balance: opts.balance ?? 0 }];
    if (q.includes("update credits")) return (opts.balance ?? 0) > 0 ? [{ balance: 0 }] : [];
    return [];
  });
}

describe("credits for monthly-plan subscribers", () => {
  it("spend the plan allowance, not their balance", async () => {
    db({ plan: "plan_monthly", balance: 0 });
    expect(await getCreditBalance("u")).toBe(Math.min(WIN, WEEK));
    expect(await deductCredit("u", 500)).toBe(true);
    const calls = sqlMock.mock.calls.map((c) => (c[0] as any).join("?"));
    expect(calls.some((q) => q.includes("insert into plan_usage"))).toBe(true);
    expect(calls.some((q) => q.includes("update credits"))).toBe(false);
  });
  it("are blocked when the window is used up and they have no old credits", async () => {
    db({ plan: "plan_monthly", usage: { window_start: new Date().toISOString(), window_used: WIN, week_start: new Date().toISOString(), week_used: WIN }, balance: 0 });
    expect(await getCreditBalance("u")).toBe(0);
    expect(await deductCredit("u", 500)).toBe(false);
    expect(await chargeCredits("u", 50)).toBe(0);
  });
  it("old plans and cancelled subscriptions use the credit balance", async () => {
    db({ plan: "plan_pro", balance: 1234 });
    expect(await getCreditBalance("u")).toBe(1234);
    db({ plan: "plan_monthly", status: "canceled", balance: 7 });
    expect(await getCreditBalance("u")).toBe(7);
  });
});
