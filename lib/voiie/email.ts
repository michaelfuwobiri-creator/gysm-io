// Single place VOIIE sends email from, so every message -- first touch,
// follow-up, demo delivery, payment nudge -- carries the same compliance
// footer (AI disclosure, postal address, working unsubscribe link) and
// List-Unsubscribe headers, and is logged on the lead's timeline.

import { getResend } from "@/lib/email/resend";
import { addMessage } from "@/lib/voiie/db";
import { unsubscribeUrl } from "@/lib/voiie/links";
import type { VoiieLead } from "@/types/voiie";

export type EmailKind = "first_touch" | "follow_up" | "final_follow_up" | "demo_delivery" | "pay_nudge";

export async function sendVoiieEmail(
  lead: Pick<VoiieLead, "id" | "contact_email" | "handle" | "display_name">,
  params: { subject: string; body: string; kind: EmailKind }
): Promise<void> {
  if (!lead.contact_email) throw new Error("Lead has no email on file.");

  const unsub = unsubscribeUrl(lead.id);
  const postal = process.env.VOIIE_POSTAL_ADDRESS;
  const footer = [
    "",
    "--",
    "Sent by VOIIE, GYSM's AI sales assistant (https://www.gysm.io).",
    ...(params.kind === "first_touch"
      ? ["You're receiving this one-time message because your business email address is published on your website or business listing."]
      : []),
    `Not interested? Unsubscribe here and you won't hear from us again: ${unsub}`,
    ...(postal ? [postal] : []),
  ].join("\n");

  const resend = await getResend();
  const { error } = await resend.emails.send({
    from: "GYSM <info@gysm.io>",
    replyTo: "info@gysm.io",
    to: lead.contact_email,
    subject: params.subject,
    text: `${params.body}\n${footer}`,
    headers: {
      "List-Unsubscribe": `<${unsub}>, <mailto:info@gysm.io?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  if (error) throw new Error(`Resend rejected the email: ${error.message}`);

  await addMessage(lead.id, "outbound", "email", params.body, { kind: params.kind });
}
