// First-touch outreach: send the initial "free demo" pitch to a hunted
// lead over Email/WhatsApp/Twitter DM, log it on the lead's message
// timeline, and flip status new -> contacted.

import { getLeadUnscoped, addMessage, updateLeadStatus } from "@/lib/voiie/db";
import { sendWhatsAppText } from "@/lib/voiie/whatsapp";
import { sendTwitterDM, lookupUserIdByHandle } from "@/lib/voiie/twitter";
import { DEFAULT_OUTREACH_TEMPLATE } from "@/lib/voiie/constants";
import type { OutreachChannel, VoiieLead } from "@/types/voiie";

export const DEFAULT_TEMPLATE = DEFAULT_OUTREACH_TEMPLATE;

export function renderTemplate(template: string, lead: Pick<VoiieLead, "handle" | "signal">): string {
  return template.replace(/\{name\}/g, lead.handle).replace(/\{pain\}/g, lead.signal || "a website");
}

let resendClient: import("resend").Resend | null = null;
async function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  if (!resendClient) {
    const { Resend } = await import("resend");
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Sends the first outreach message to a lead over the given channel, logs
 * it on the lead's message timeline, and flips status new -> contacted.
 */
export async function sendOutreach(leadId: string, channel: OutreachChannel, template = DEFAULT_TEMPLATE): Promise<void> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  const message = renderTemplate(template, lead);

  if (channel === "whatsapp") {
    if (!lead.contact_phone) throw new Error("Lead has no phone number on file for WhatsApp outreach.");
    await sendWhatsAppText(lead.contact_phone, message);
  } else if (channel === "email") {
    if (!lead.contact_email) throw new Error("Lead has no email on file for email outreach.");
    const resend = await getResend();
    await resend.emails.send({
      from: "VOIIE <voiie@gysm.io>",
      to: lead.contact_email,
      subject: `Free 10-minute website demo for ${lead.handle}`,
      text: message,
    });
  } else if (channel === "twitter") {
    const userId = await lookupUserIdByHandle(lead.handle);
    if (!userId) throw new Error(`Could not resolve Twitter user id for ${lead.handle}.`);
    await sendTwitterDM(userId, message);
  }

  await addMessage(leadId, "outbound", channel, message);
  if (lead.status === "new") await updateLeadStatus(leadId, "contacted");
}
