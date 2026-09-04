// First-touch outreach: send the initial "free demo" pitch to a hunted
// lead over Email/WhatsApp/Twitter DM, log it on the lead's message
// timeline, and flip status new -> contacted.

import { getLeadUnscoped, addMessage, updateLeadStatus, getSettings } from "@/lib/voiie/db";
import { sendWhatsAppText } from "@/lib/voiie/whatsapp";
import { sendTwitterDM, lookupUserIdByHandle } from "@/lib/voiie/twitter";
import { DEFAULT_OUTREACH_TEMPLATE } from "@/lib/voiie/constants";
import { pickOutreachTemplate } from "@/lib/voiie/spintax";
import { getResend } from "@/lib/email/resend";
import type { OutreachChannel, VoiieLead } from "@/types/voiie";

export const DEFAULT_TEMPLATE = DEFAULT_OUTREACH_TEMPLATE;

export function renderTemplate(template: string, lead: Pick<VoiieLead, "handle" | "signal">): string {
  return template.replace(/\{name\}/g, lead.handle).replace(/\{pain\}/g, lead.signal || "a website");
}

/**
 * Sends the first outreach message to a lead over the given channel, logs
 * it on the lead's message timeline, and flips status new -> contacted.
 *
 * Honors the operator's hunt-safety settings (voiie_settings): a lead
 * marked do-not-contact is refused outright regardless of caller intent,
 * a global kill switch blocks all outreach the same way it blocks
 * hunting, and -- unless the caller passed an explicit `template` -- a
 * spintax-varied message is used when spintax is enabled (the default)
 * instead of always sending the exact same sentence.
 */
export async function sendOutreach(leadId: string, channel: OutreachChannel, template?: string): Promise<void> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");

  const settings = await getSettings(lead.owner_user_id);
  if (settings.kill_switch) throw new Error("Outreach is paused (kill switch is on).");

  const effectiveTemplate = template ?? (settings.spintax_enabled ? pickOutreachTemplate() : DEFAULT_TEMPLATE);
  const message = renderTemplate(effectiveTemplate, lead);

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
