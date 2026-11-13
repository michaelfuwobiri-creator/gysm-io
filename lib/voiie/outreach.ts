// First-touch outreach: send the initial "free demo" pitch to a hunted
// lead over Email/WhatsApp/Twitter DM, log it on the lead's message
// timeline, and flip status new -> contacted.

import { getLeadUnscoped, addMessage, updateLeadStatus, getSettings, listMessages } from "@/lib/voiie/db";
import { sendWhatsAppText } from "@/lib/voiie/whatsapp";
import { sendTwitterDM, lookupUserIdByHandle } from "@/lib/voiie/twitter";
import { DEFAULT_OUTREACH_TEMPLATE } from "@/lib/voiie/constants";
import { pickOutreachTemplate, pickPlacesTemplate, pickWeakSiteTemplate } from "@/lib/voiie/spintax";
import { isAgencyLead, postalAddressConfigured } from "@/lib/voiie/compliance";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { intakeUrl } from "@/lib/voiie/links";
import type { OutreachChannel, VoiieLead } from "@/types/voiie";

export const DEFAULT_TEMPLATE = DEFAULT_OUTREACH_TEMPLATE;

/** Short (5-6 words), names the business, no "free" (spam-filter word). The
 *  autopilot's follow-ups reuse it as "Re: <subject>" so they thread. */
export function firstTouchSubject(lead: Pick<VoiieLead, "handle" | "display_name">): string {
  return `A website idea for ${leadLabel(lead)}`;
}

/** Name to address the lead by: a Places lead's `handle` is a Google Place
 *  ID (not something a human should be greeted with), so prefer the
 *  business name when there is one. */
export function leadLabel(lead: Pick<VoiieLead, "handle" | "display_name">): string {
  return lead.display_name?.trim() || lead.handle;
}

export function renderTemplate(
  template: string,
  lead: Pick<VoiieLead, "handle" | "signal" | "display_name">,
  link?: string
): string {
  let out = template
    .replace(/\{name\}/g, leadLabel(lead))
    .replace(/\{business\}/g, leadLabel(lead))
    .replace(/\{issues\}/g, lead.signal?.match(/\(([^)]+)\)/)?.[1] || "a bit dated")
    .replace(/\{pain\}/g, lead.signal || "a website")
    .replace(/\{link\}/g, link ?? "");
  // Every first touch carries the self-serve link (30-second form -> demo
  // + pay link by email), so a reply is not needed to get started.
  if (link && !template.includes("{link}")) out += `\n\nStart here (30 seconds, no signup): ${link}`;
  return out;
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
export async function sendOutreach(
  leadId: string,
  channel: OutreachChannel,
  template?: string,
  opts: { subject?: string } = {}
): Promise<void> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");
  if (lead.do_not_contact) throw new Error("This lead is marked do-not-contact.");

  const settings = await getSettings(lead.owner_user_id);
  if (settings.kill_switch) throw new Error("Outreach is paused (kill switch is on).");

  const effectiveTemplate =
    template ??
    (lead.tags?.includes("weak-site")
      ? pickWeakSiteTemplate()
      : lead.platform === "places"
      ? pickPlacesTemplate()
      : settings.spintax_enabled
        ? pickOutreachTemplate()
        : DEFAULT_TEMPLATE);
  // Agency partner leads get a partnership note, not the small-business
  // "free demo site" intake link.
  const message = renderTemplate(effectiveTemplate, lead, isAgencyLead(lead) ? undefined : intakeUrl(lead.id));

  if (channel === "whatsapp") {
    // Meta's WhatsApp Business policy requires opt-in before any
    // business-initiated message, and cold sends to scraped numbers get the
    // sender number restricted. Only message people who wrote to us first.
    const history = await listMessages(leadId);
    if (!history.some((m) => m.direction === "inbound" && m.channel === "whatsapp")) {
      throw new Error("WhatsApp needs opt-in: this lead has not messaged us on WhatsApp. Use email, or wait for them to reply.");
    }
    if (!lead.contact_phone) throw new Error("Lead has no phone number on file for WhatsApp outreach.");
    await sendWhatsAppText(lead.contact_phone, message);
  } else if (channel === "email") {
    if (!lead.contact_email) throw new Error("Lead has no email on file for email outreach.");
    // CAN-SPAM: every commercial email needs a valid postal address.
    if (lead.platform !== "manual" && !postalAddressConfigured()) {
      throw new Error("Set VOIIE_POSTAL_ADDRESS (a real mailing address) before emailing prospects -- CAN-SPAM requires it.");
    }
    // sendVoiieEmail adds the compliance footer (AI disclosure, postal
    // address, unsubscribe link + List-Unsubscribe headers) and logs the
    // message itself, so return early instead of double-logging below.
    await sendVoiieEmail(lead, {
      subject: opts.subject?.trim() || firstTouchSubject(lead),
      body: message,
      kind: "first_touch",
    });
    if (lead.status === "new") await updateLeadStatus(leadId, "contacted");
    return;
  } else if (channel === "twitter") {
    const userId = await lookupUserIdByHandle(lead.handle);
    if (!userId) throw new Error(`Could not resolve Twitter user id for ${lead.handle}.`);
    await sendTwitterDM(userId, message);
  }

  await addMessage(leadId, "outbound", channel, message);
  if (lead.status === "new") await updateLeadStatus(leadId, "contacted");
}
