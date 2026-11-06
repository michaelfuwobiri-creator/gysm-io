import { sql } from "@/lib/db";
import {
  PLAN_MONTHLY_ID,
  PLAN_WEEK_DAYS,
  PLAN_WEEKLY_LIMIT_CREDITS,
  PLAN_WINDOW_HOURS,
  PLAN_WINDOW_LIMIT_CREDITS,
} from "@/lib/credits-constants";

// Usage limits for the EUR 20/month plan, modelled on Claude's: a 5-hour
// window that starts with the subscriber's first request after the last one
// ended, plus a weekly cap that starts the same way. Everything is counted in
// credits (real AI cost). One row per subscriber in plan_usage (migration 0036).

const WINDOW_MS = PLAN_WINDOW_HOURS * 3600_000;
const WEEK_MS = PLAN_WEEK_DAYS * 86400_000;

export type PlanUsage = {
  windowUsed: number;
  windowLimit: number;
  /** When the current 5-hour window ends; null when none is running (the next request starts one). */
  windowResetsAt: string | null;
  weekUsed: number;
  weekLimit: number;
  weekResetsAt: string | null;
  /** Credits that can still be spent right now: the smaller of the two allowances. */
  remaining: number;
};

type Row = { window_start: string | null; window_used: number | string; week_start: string | null; week_used: number | string };

/** Pure: turns a stored row into the usage the subscriber sees at `now`. */
export function usageFromRow(row: Row | null | undefined, now = Date.now()): PlanUsage {
  const wStart = row?.window_start ? new Date(row.window_start).getTime() : null;
  const kStart = row?.week_start ? new Date(row.week_start).getTime() : null;
  const windowLive = wStart !== null && now < wStart + WINDOW_MS;
  const weekLive = kStart !== null && now < kStart + WEEK_MS;
  const windowUsed = windowLive ? Number(row?.window_used) || 0 : 0;
  const weekUsed = weekLive ? Number(row?.week_used) || 0 : 0;
  return {
    windowUsed,
    windowLimit: PLAN_WINDOW_LIMIT_CREDITS,
    windowResetsAt: windowLive ? new Date((wStart as number) + WINDOW_MS).toISOString() : null,
    weekUsed,
    weekLimit: PLAN_WEEKLY_LIMIT_CREDITS,
    weekResetsAt: weekLive ? new Date((kStart as number) + WEEK_MS).toISOString() : null,
    remaining: Math.max(0, Math.min(PLAN_WINDOW_LIMIT_CREDITS - windowUsed, PLAN_WEEKLY_LIMIT_CREDITS - weekUsed)),
  };
}

/** Is this user on the monthly plan with a subscription in good standing? */
export async function hasMonthlyPlan(userId: string): Promise<boolean> {
  try {
    const rows = (await sql`select plan, status from subscriptions where user_id = ${userId} limit 1`) as any[];
    const r = rows[0];
    return !!r && r.plan === PLAN_MONTHLY_ID && (r.status === "active" || r.status === "trialing");
  } catch (error: any) {
    console.error("[usage] plan lookup failed:", error?.message || error);
    return false;
  }
}

let tableMissingLogged = false;
function isMissingTable(e: any): boolean {
  const code = e?.code || e?.sourceError?.code;
  if (code === "42P01") {
    if (!tableMissingLogged) console.error("[usage] plan_usage table missing: run db/migrations/0036_plan_usage.sql");
    tableMissingLogged = true;
    return true;
  }
  return false;
}

export async function getPlanUsage(userId: string): Promise<PlanUsage> {
  try {
    const rows = (await sql`select window_start, window_used, week_start, week_used from plan_usage where user_id = ${userId} limit 1`) as Row[];
    return usageFromRow(rows[0]);
  } catch (e: any) {
    // Before migration 0036 nothing can be tracked: let paying users work.
    if (isMissingTable(e)) return usageFromRow(null);
    throw e;
  }
}

/**
 * Adds `credits` of usage (negative to refund). Starts a new 5-hour window or
 * week when the previous one has ended. Returns the usage afterwards.
 */
export async function recordPlanUsage(userId: string, credits: number): Promise<PlanUsage> {
  const c = Math.round(credits);
  const win = `${PLAN_WINDOW_HOURS} hours`;
  const week = `${PLAN_WEEK_DAYS} days`;
  try {
    const rows = (await sql`
      insert into plan_usage (user_id, window_start, window_used, week_start, week_used, updated_at)
      values (${userId}, now(), greatest(${c}, 0), now(), greatest(${c}, 0), now())
      on conflict (user_id) do update set
        window_start = case when plan_usage.window_start is null or plan_usage.window_start + ${win}::interval <= now() then now() else plan_usage.window_start end,
        window_used = greatest(case when plan_usage.window_start is null or plan_usage.window_start + ${win}::interval <= now() then 0 else plan_usage.window_used end + ${c}, 0),
        week_start = case when plan_usage.week_start is null or plan_usage.week_start + ${week}::interval <= now() then now() else plan_usage.week_start end,
        week_used = greatest(case when plan_usage.week_start is null or plan_usage.week_start + ${week}::interval <= now() then 0 else plan_usage.week_used end + ${c}, 0),
        updated_at = now()
      returning window_start, window_used, week_start, week_used
    `) as Row[];
    return usageFromRow(rows[0]);
  } catch (e: any) {
    if (isMissingTable(e)) return usageFromRow(null);
    throw e;
  }
}

/** "2 h 14 min" style duration until an ISO time. */
export function untilText(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

/** Why this user can't start more work, worded for them, with a code the UI can act on. */
export async function usageBlockedError(userId: string): Promise<{ error: string; code: "LIMIT_REACHED" | "NO_PLAN"; resetsAt?: string }> {
  if (await hasMonthlyPlan(userId)) {
    const u = await getPlanUsage(userId);
    const weekly = u.weekUsed >= u.weekLimit;
    const at = weekly ? u.weekResetsAt : u.windowResetsAt;
    if (at) {
      return {
        error: weekly
          ? `You've reached this week's usage limit. It resets in ${untilText(at)}.`
          : `You've reached your 5-hour usage limit. It resets in ${untilText(at)}.`,
        code: "LIMIT_REACHED",
        resetsAt: at,
      };
    }
  }
  return { error: "Subscribe to GYSM (€20/month) to keep building.", code: "NO_PLAN" };
}

export type UsageSummary = { title: string; value: string; cta: { href: string; label: string } | null };

/** How much of a full 5-hour window can still be used right now, 0-100 (the weekly cap can lower it). */
export function percentLeft(u: PlanUsage): number {
  return creditsToPercent(u.remaining);
}

export function creditsToPercent(remaining: number): number {
  return Math.max(0, Math.min(100, Math.floor((remaining / PLAN_WINDOW_LIMIT_CREDITS) * 100)));
}

/** The small "credits / usage" card in the sidebar. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const { isUnlimitedUser } = await import("@/lib/unlimited");
  if (await isUnlimitedUser(userId)) return { title: "Plan", value: "Unlimited", cta: null };
  if (await hasMonthlyPlan(userId)) {
    const u = await getPlanUsage(userId);
    return { title: "Usage", value: `${percentLeft(u)}% left`, cta: { href: "/billing", label: "View usage →" } };
  }
  return { title: "Plan", value: "None", cta: { href: "/pricing", label: "Subscribe →" } };
}
