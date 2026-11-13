// Server-side helpers for MCP tools that act for a GYSM user: the caller
// proves who they are with their own GYSM API key (Authorization: Bearer
// gysm_live_...). Loaded lazily by lib/mcp/server.ts so that file stays
// importable without a database.
import { sql } from "@/lib/db";
import { verifyApiKey } from "@/lib/apiKeys";
import { PRICING_PLANS } from "@/lib/stripe";
import { createPlanCheckout } from "@/lib/billing/checkout";
import { getUsageSummary } from "@/lib/planUsage";
import { executeStoreTool } from "@/lib/stores/agent";

export type KeyUser = { id: string; email: string | null };

export async function userForKey(apiKey: string | undefined): Promise<KeyUser | null> {
  if (!apiKey) return null;
  const auth = await verifyApiKey(apiKey);
  if (!auth) return null;
  let email: string | null = null;
  try {
    const rows = await sql`select email from users where clerk_id = ${auth.userId} limit 1`;
    email = ((rows[0] as any)?.email as string) ?? null;
  } catch {
    /* email is optional: Stripe asks for it on the checkout page */
  }
  return { id: auth.userId, email };
}

/** The plans GYSM sells today (hidden legacy plans are left out). */
export function visiblePlans() {
  return PRICING_PLANS.filter((p) => !p.hidden).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    currency: p.currency.toUpperCase(),
    interval: p.interval,
    description: p.description,
    tagline: p.tagline ?? null,
  }));
}

export async function planCheckout(user: KeyUser, planId: string) {
  return createPlanCheckout(user, planId);
}

export async function usageFor(user: KeyUser) {
  return getUsageSummary(user.id);
}

export async function runStoreTool(user: KeyUser, name: string, args: unknown) {
  return executeStoreTool(user.id, name, args ?? {});
}
