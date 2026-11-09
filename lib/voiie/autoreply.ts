// Automatic answers to inbound email replies, limited to the cases where a
// canned answer is safe: they said yes / asked about price / asked how it
// works / said no thanks. Anything else is left for the operator in the
// inbox. Off unless VOIIE_AUTOREPLY=1. STOP-type replies never get a reply
// (they are opted out by the webhook). Max 3 automatic replies per lead and
// at least an hour apart.

import { sql } from "@/lib/db";
import { getSettings, setDoNotContact, updateLeadStatus, addMessage } from "@/lib/voiie/db";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { classifyReply, suggestReplies } from "@/lib/voiie/reply";
import type { VoiieLead } from "@/types/voiie";

export async function maybeAutoReply(
  lead: VoiieLead,
  inboundText: string,
  ctx: { subject?: string | null; messageId?: string | null }
): Promise<{ sent: boolean; why?: string }> {
  if (process.env.VOIIE_AUTOREPLY !== "1") return { sent: false, why: "autoreply_off" };
  if (lead.do_not_contact || !lead.contact_email) return { sent: false, why: "no_contact" };
  if ((await getSettings(lead.owner_user_id)).kill_switch) return { sent: false, why: "kill_switch" };

  const intent = classifyReply(inboundText);
  if (!["interested", "price", "question", "not_now"].includes(intent)) return { sent: false, why: `intent_${intent}` };

  const rows = (await sql`
    select count(*)::int as n, max(created_at) as last
    from voiie_messages
    where lead_id = ${lead.id} and direction = 'outbound' and channel = 'email' and meta->>'auto' = 'true'
  `) as unknown as Array<{ n: number; last: string | null }>;
  const n = rows[0]?.n ?? 0;
  const last = rows[0]?.last ? new Date(rows[0].last).getTime() : 0;
  if (n >= 3) return { sent: false, why: "autoreply_limit" };
  if (Date.now() - last < 60 * 60 * 1000) return { sent: false, why: "autoreply_recent" };

  const pick = suggestReplies(lead, inboundText)[0];
  if (!pick) return { sent: false, why: "no_suggestion" };

  const subj = (ctx.subject || "").trim();
  await sendVoiieEmail(lead, {
    subject: subj ? (/^re:/i.test(subj) ? subj : `Re: ${subj}`) : "Re: your free website demo",
    body: pick.body,
    kind: "reply",
    inReplyTo: ctx.messageId ?? undefined,
    meta: { auto: true, intent },
  });
  if (intent === "not_now") {
    // The polite close promises no more email -- honour it.
    await setDoNotContact(lead.id, true);
    await updateLeadStatus(lead.id, "lost");
    await addMessage(lead.id, "outbound", "system", "Said no thanks; auto-closed and marked do-not-contact.");
  }
  return { sent: true };
}
