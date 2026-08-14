import { sql } from "@/lib/db";

export const CREDIT_COST_PER_BUILD = 500;

// Builds included per plan per month, and the credit equivalent
// (builds * CREDIT_COST_PER_BUILD). Single source of truth for
// lib/stripe.ts PRICING_PLANS -- change build counts here.
export const BUILDS_PER_PLAN = {
  credits_starter: 5,
  credits_popular: 20,
  credits_bulk: 50,
  plan_builder: 40,
  plan_pro: 150,
  plan_studio: 600,
} as const;

export const CREDITS_PER_PLAN = Object.fromEntries(
  Object.entries(BUILDS_PER_PLAN).map(([id, builds]) => [id, builds * CREDIT_COST_PER_BUILD])
) as Record<keyof typeof BUILDS_PER_PLAN, number>;

export async function getCreditBalance(userId: string): Promise<number> {
  try {
    const rows = await sql`select balance from credits where user_id = ${userId}`;
    return (rows[0] as any)?.balance ?? 0;
  } catch (error: any) {
    console.error("[credits] getCreditBalance failed:", error.message);
    return 0;
  }
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
