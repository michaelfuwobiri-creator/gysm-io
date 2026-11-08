// The hands-off middle of the funnel: once a lead's consultation is
// answered (via the self-serve /start page, WhatsApp, or the dashboard),
// build their free demo, mint a Stripe Checkout link, and deliver both by
// email (and WhatsApp when we have a number). Idempotent -- calling it for
// a lead that already has a demo just re-sends nothing and returns.

import { getLeadUnscoped, getConsultationAnswers, setDemoProject, addMessage } from "@/lib/voiie/db";
import { buildFreeDemo } from "@/lib/voiie/demo";
import { createVoiieCheckoutSession } from "@/lib/voiie/billing";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { sendDemoReadyTemplate } from "@/lib/voiie/whatsapp";
import { leadLabel } from "@/lib/voiie/outreach";
import { notifyOwner } from "@/lib/voiie/notify";

export interface DeliveredDemo {
  demoUrl: string;
  checkoutUrl: string | null;
  alreadyBuilt: boolean;
}

function trackedDemoUrl(leadId: string, publicUrl: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  return `${siteUrl}/api/voiie/track/${leadId}?to=${encodeURIComponent(publicUrl)}`;
}

export async function buildDemoAndDeliver(leadId: string): Promise<DeliveredDemo> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

  if (lead.demo_project_id) {
    const publicUrl = `${siteUrl}/publish/${lead.demo_project_id}`;
    return { demoUrl: trackedDemoUrl(lead.id, publicUrl), checkoutUrl: null, alreadyBuilt: true };
  }

  const { answers } = await getConsultationAnswers(lead.id);
  const demo = await buildFreeDemo(lead.owner_user_id, answers, leadLabel(lead));
  await setDemoProject(lead.id, demo.projectId);
  const demoUrl = trackedDemoUrl(lead.id, demo.publicUrl);

  let checkoutUrl: string | null = null;
  try {
    checkoutUrl = (await createVoiieCheckoutSession(lead.id, "voiie_starter")).url;
  } catch (err: any) {
    console.error("[voiie/pipeline] could not create checkout link (demo still delivered):", err.message);
  }

  const name = answers.business?.name || leadLabel(lead);
  const body = [
    `Hi — your free demo for ${name} is ready:`,
    demoUrl,
    "",
    checkoutUrl
      ? `If you like it, you can take it live on your own account here (Starter plan, one-time payment):\n${checkoutUrl}`
      : "If you like it, just reply to this email and we'll get it live for you.",
    "",
    "Want changes first? Reply to this email and tell us what to adjust.",
  ].join("\n");

  await addMessage(lead.id, "outbound", "system", `Free demo ready: ${demoUrl}${checkoutUrl ? `\nCheckout: ${checkoutUrl}` : ""}`);

  if (lead.contact_email) {
    try {
      await sendVoiieEmail(lead, { subject: `Your free demo for ${name} is ready`, body, kind: "demo_delivery" });
    } catch (err: any) {
      console.error("[voiie/pipeline] demo email failed:", err.message);
    }
  }
  if (lead.contact_phone) {
    try {
      await sendDemoReadyTemplate(lead.contact_phone, name, demoUrl);
    } catch (err: any) {
      console.error("[voiie/pipeline] WhatsApp demo template failed:", err.message);
    }
  }

  await notifyOwner(`Demo built and sent to ${name} (${lead.contact_email || lead.contact_phone || "no contact"}). Pay link ${checkoutUrl ? "attached" : "missing"}.`);

  return { demoUrl, checkoutUrl, alreadyBuilt: false };
}
