import { supabaseAdmin } from "@/lib/supabase";

/**
 * Source of truth for the credits/paywall system.
 * 500 credits = 1 build. These numbers must stay in sync with the SQL in
 * supabase/migrations/0001_init.sql and with lib/stripe.ts PRICING_PLANS.
 */
export const CREDIT_COST_PER_BUILD = 500;
export const LIMITS = { starter: 30, agency: 300 } as const;
export const CREDITS_PER_PLAN = { starter: 15000, agency: 150000 } as const;

/** Current credit balance for a user. Returns 0 (never throws) so a transient
 *  read error fails CLOSED — i.e. blocks generation rather than granting it. */
export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[credits] getCreditBalance failed:", error.message);
    return 0;
  }
  return data?.balance ?? 0;
}

/** Whether the user has a Stripe subscription currently marked active. */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.status === "active";
}

/**
 * Gate for the /builder PAGE (not the generate call itself). A subscriber
 * with an active plan can open the builder even if this instant shows 0
 * credits (e.g. brief lag right after a renewal webhook) — the actual
 * /api/generate call below still enforces the real balance at build time.
 */
export async function canAccessBuilder(userId: string): Promise<boolean> {
  const [balance, subscribed] = await Promise.all([
    getCreditBalance(userId),
    hasActiveSubscription(userId),
  ]);
  return balance >= CREDIT_COST_PER_BUILD || subscribed;
}

/**
 * Atomically deducts credits via a Postgres function (see migration SQL) so
 * two concurrent /api/generate requests can't both read balance=500 and both
 * proceed. Returns false if the balance was insufficient — no partial charge.
 */
export async function deductCredit(
  userId: string,
  amount: number = CREDIT_COST_PER_BUILD
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("deduct_credit", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("[credits] deductCredit failed:", error.message);
    return false;
  }
  return Boolean(data);
}

/** Adds credits — called from the Stripe webhook on payment. */
export async function addCredits(userId: string, amount: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_credits", {
    p_user_id: userId,
    p_amount: amount,
  });
  if (error) {
    console.error("[credits] addCredits failed:", error.message);
    throw error; // let the webhook handler decide how to respond to Stripe
  }
}
