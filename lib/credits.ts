import { supabaseAdmin } from "@/lib/supabase";
export const CREDIT_COST_PER_BUILD = 500;
export const LIMITS = { starter: 30, agency: 300 } as const;
export const CREDITS_PER_PLAN = { starter: 15000, agency: 150000 } as const;
export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.from("credits").select("balance").eq("user_id", userId).maybeSingle();
  if (error) { console.error("[credits] getCreditBalance failed:", error.message); return 0; }
  return data?.balance?? 0;
}
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
  if (error ||!data) return false;
  return data.status === "active";
}
export async function canAccessBuilder(userId: string): Promise<boolean> {
  const [balance, subscribed] = await Promise.all([getCreditBalance(userId), hasActiveSubscription(userId)]);
  return balance >= CREDIT_COST_PER_BUILD || subscribed;
}
export async function deductCredit(userId: string, amount: number = CREDIT_COST_PER_BUILD): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("deduct_credit", { p_user_id: userId, p_amount: amount });
  if (error) { console.error("[credits] deductCredit failed:", error.message); return false; }
  return Boolean(data);
}
export async function addCredits(userId: string, amount: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_credits", { p_user_id: userId, p_amount: amount });
  if (error) { console.error("[credits] addCredits failed:", error.message); throw error; }
}
