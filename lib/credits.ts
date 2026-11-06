import { sql } from "@/lib/db";
// Plain constants (no db import) live in credits-constants.ts. Imported
// here (for local use below) and re-exported so existing `@/lib/credits`
// importers keep working -- see that file for why the split exists
// (client-bundle DB leak fix).
import { CREDIT_COST_PER_BUILD, CREDIT_COST_PER_BUILD_BEST, CREDIT_COST_PER_BUILD_CLAUDE, BUILDS_PER_PLAN, CREDITS_PER_PLAN, FLAT_PROFIT_USD, BUILD_COST_USD, UNLIMITED_BALANCE } from "@/lib/credits-constants";
import { isUnlimitedUser } from "@/lib/unlimited";
import { getPlanUsage, hasMonthlyPlan, recordPlanUsage } from "@/lib/planUsage";
export { CREDIT_COST_PER_BUILD, CREDIT_COST_PER_BUILD_BEST, CREDIT_COST_PER_BUILD_CLAUDE, BUILDS_PER_PLAN, CREDITS_PER_PLAN, FLAT_PROFIT_USD, BUILD_COST_USD };

async function storedBalance(userId: string): Promise<number> {
  try {
    const rows = await sql`select balance from credits where user_id = ${userId}`;
    return (rows[0] as any)?.balance ?? 0;
  } catch (error: any) {
    console.error("[credits] getCreditBalance failed:", error.message);
    return 0;
  }
}

/**
 * What the user can spend right now, in credits. Admins: unlimited.
 * Monthly-plan subscribers: what's left of their 5-hour window / weekly cap
 * (lib/planUsage.ts), plus any credits they bought before subscribing. Everyone
 * else: their credit balance.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  if (await isUnlimitedUser(userId)) return UNLIMITED_BALANCE;
  if (await hasMonthlyPlan(userId)) {
    const [usage, stored] = await Promise.all([getPlanUsage(userId), storedBalance(userId)]);
    return usage.remaining + stored;
  }
  return storedBalance(userId);
}

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  try {
    const rows = await sql`select status from subscriptions where user_id = ${userId}`;
    return (rows[0] as any)?.status === "active";
  } catch (error: any) {
    console.error("[credits] hasActiveSubscription failed:", error.message);
    return false;
  }
}

export async function canAccessBuilder(userId: string): Promise<boolean> {
  const [balance, subscribed] = await Promise.all([
    getCreditBalance(userId),
    hasActiveSubscription(userId),
  ]);
  return balance >= CREDIT_COST_PER_BUILD || subscribed;
}

// Atomic check-and-deduct: the WHERE clause runs inside the single UPDATE,
// so two concurrent requests from the same user can't both pass a balance
// check read before either deduction landed -- Postgres serializes the two
// updates on the row, and the second re-evaluates the guard against the
// already-decremented balance. Returns false (no row updated) if
// insufficient credit or the user has no credits row at all yet.
export async function deductCredit(
  userId: string,
  amount: number = CREDIT_COST_PER_BUILD
): Promise<boolean> {
  if (await isUnlimitedUser(userId)) return true;
  if (await hasMonthlyPlan(userId)) {
    // Plan allowance first; credits bought earlier are the fallback.
    const usage = await getPlanUsage(userId);
    if (usage.remaining >= amount) {
      await recordPlanUsage(userId, amount);
      return true;
    }
  }
  try {
    const rows = await sql`
      update credits
      set balance = balance - ${amount}, updated_at = now()
      where user_id = ${userId} and balance >= ${amount}
      returning balance
    `;
    return rows.length > 0;
  } catch (error: any) {
    console.error("[credits] deductCredit failed:", error.message);
    return false;
  }
}

// Upserts so a brand-new user's first payment doesn't need a pre-existing
// credits row. Called from the Stripe webhook on checkout.session.completed
// and invoice.paid (renewals).
export async function addCredits(userId: string, amount: number): Promise<void> {
  try {
    await sql`
      insert into credits (user_id, balance, updated_at)
      values (${userId}, ${amount}, now())
      on conflict (user_id)
      do update set balance = credits.balance + excluded.balance, updated_at = now()
    `;
  } catch (error: any) {
    console.error("[credits] addCredits failed:", error.message);
    throw error;
  }
}

// Metered (after-the-fact) charge for usage-priced features like GYSM Shell,
// where the real cost is only known once the model call returns. Unlike
// deductCredit this never fails for "insufficient balance" -- the work
// already happened, so it takes what's left and floors at 0. Callers gate
// on a minimum balance BEFORE starting work (see SHELL_MIN_BALANCE_FOR_AI).
export async function chargeCredits(userId: string, amount: number): Promise<number> {
  if (await isUnlimitedUser(userId)) return UNLIMITED_BALANCE;
  if (await hasMonthlyPlan(userId)) {
    const before = await getPlanUsage(userId);
    if (before.remaining > 0) {
      // Metered after the fact: the work already happened, so record all of
      // it even if it goes a little past the limit; the next check blocks.
      const after = await recordPlanUsage(userId, amount);
      return after.remaining + (await storedBalance(userId));
    }
  }
  try {
    const rows = await sql`
      update credits
      set balance = greatest(balance - ${amount}, 0), updated_at = now()
      where user_id = ${userId}
      returning balance
    `;
    return (rows[0] as any)?.balance ?? 0;
  } catch (error: any) {
    console.error("[credits] chargeCredits failed:", error.message);
    return 0;
  }
}

/** Gives back a charge for work that failed (e.g. a media job). */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  if (await isUnlimitedUser(userId)) return;
  if (await hasMonthlyPlan(userId)) {
    await recordPlanUsage(userId, -amount);
    return;
  }
  await addCredits(userId, amount);
}
