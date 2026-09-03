import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

/**
 * Renewal/upgrade nudges for converted VOIIE customers.
 *
 * v1 scope note: VOIIE's plans (lib/stripe.ts's voiie_* entries) are
 * one-time Checkout payments, not Stripe subscriptions -- see
 * lib/voiie/billing.ts -- so there's no subscription renewal date on
 * file yet to act on here. This route is wired up (cron entry in
 * vercel.json, CRON_SECRET-gated like cron/hunt) so the schedule exists
 * and this is the one place to extend, but it intentionally does nothing
 * destructive until real renewal tracking is added: e.g. a
 * `voiie_leads.plan_expires_at` column set at conversion time, swept here
 * to WhatsApp/email a renewal offer as it approaches.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await sql`
      select count(*)::int as converted from voiie_leads where status = 'converted'
    `;
    return Response.json({
      ok: true,
      convertedCustomers: (rows[0] as any)?.converted ?? 0,
      note: "No renewal date tracking configured yet -- see this file's comment to extend.",
    });
  } catch (error: any) {
    console.error("[voiie/cron/renewals] failed:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
