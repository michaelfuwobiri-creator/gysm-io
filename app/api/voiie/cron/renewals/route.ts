import { NextRequest } from "next/server";
import { listDueRenewals, markRenewalStatus } from "@/lib/voiie/db";
import { createRenewalCheckoutLink } from "@/lib/voiie/billing";
import { sendWhatsAppText } from "@/lib/voiie/whatsapp";

const RENEWAL_LABEL: Record<string, string> = {
  domain: "Domain + hosting renewal",
  hosting: "Hosting renewal",
  upgrade: "Plan upgrade",
  repair: "Site repair",
  add_feature: "Add feature",
};

/**
 * Daily sweep (vercel.json cron) over voiie_renewals rows due in the next
 * 30 days that haven't been sent yet: sends a WhatsApp reminder with a
 * Stripe checkout link (falls back to just logging it if the customer has
 * no phone on file) and flips status pending -> sent so the same renewal
 * doesn't get re-sent every day until it's paid or its due_date passes.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const due = await listDueRenewals(30);
  const results: { renewalId: string; ok: boolean; error?: string }[] = [];

  for (const { renewal, customer, contactPhone } of due) {
    try {
      const label = `${RENEWAL_LABEL[renewal.type] ?? "Renewal"} — ${customer.business_name}`;
      const { url, sessionId } = await createRenewalCheckoutLink({
        renewalId: renewal.id,
        customerId: customer.id,
        label,
        amountCents: renewal.amount_cents,
      });

      if (contactPhone) {
        await sendWhatsAppText(
          contactPhone,
          `Hey ${customer.business_name}! Your ${label.toLowerCase()} for ${customer.gysm_subdomain} is due soon. Renew here: ${url}`
        );
      } else {
        console.warn(`[voiie/cron/renewals] customer ${customer.id} has no phone on file -- link generated but not sent:`, url);
      }

      await markRenewalStatus(renewal.id, "sent", sessionId);
      results.push({ renewalId: renewal.id, ok: true });
    } catch (error: any) {
      console.error(`[voiie/cron/renewals] failed for renewal ${renewal.id}:`, error.message);
      results.push({ renewalId: renewal.id, ok: false, error: error.message });
    }
  }

  return Response.json({ ok: true, due: due.length, results });
}

export const dynamic = "force-dynamic";
