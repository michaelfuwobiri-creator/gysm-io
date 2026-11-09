// Reply handling helpers: the per-lead Reply-To address, matching an
// inbound email back to its lead, trimming quoted text, and drafting
// suggested replies. Suggestions are plain templates keyed on a simple
// intent guess -- they are SHOWN to the operator and never sent on their own.

import { intakeUrl } from "@/lib/voiie/links";
import type { VoiieLead } from "@/types/voiie";

// Local copy of outreach.ts's leadLabel: importing it would create an import
// cycle (outreach -> email -> reply).
function leadLabel(lead: Pick<VoiieLead, "handle" | "display_name">): string {
  return lead.display_name?.trim() || lead.handle;
}

/** Inbound mail domain, e.g. "reply.gysm.io" (a subdomain with Resend
 *  Receiving enabled so the root domain's own mail is untouched). Unset =
 *  replies keep going to info@gysm.io exactly as before. */
export function replyDomain(): string | null {
  const d = (process.env.VOIIE_REPLY_DOMAIN || "").trim().toLowerCase();
  return d || null;
}

/** Reply-To for a lead: r-<leadId>@<domain>, or the old shared inbox. */
export function replyAddressFor(leadId: string): string {
  const d = replyDomain();
  return d ? `r-${leadId}@${d}` : "info@gysm.io";
}

const UUID = /r-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

/** Pull a lead id out of any of the "to" addresses on an inbound email. */
export function leadIdFromAddresses(addresses: string[]): string | null {
  for (const a of addresses) {
    const m = UUID.exec(a);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** "Name <a@b.com>" or "a@b.com" -> "a@b.com" (lower-cased). */
export function bareEmail(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** Drop the quoted original and signature noise so the inbox shows only
 *  what the person actually wrote. */
export function stripQuoted(text: string): string {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(original message|forwarded message)/i.test(line.trim())) break;
    if (/^from:\s.+/i.test(line.trim()) && out.length > 0 && out[out.length - 1].trim() === "") break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  const t = out.join("\n").trim();
  return (t || (text || "").trim()).slice(0, 4000);
}

export type ReplyIntent = "stop" | "interested" | "price" | "question" | "not_now" | "change" | "other";

export function classifyReply(text: string): ReplyIntent {
  const t = (text || "").toLowerCase();
  if (/\b(stop|unsubscribe|remove me|do not contact|don'?t contact|take me off|no more emails?)\b/.test(t)) return "stop";
  if (/\b(not interested|no thanks|no thank you|already have|we are all set|we're all set|not looking)\b/.test(t)) return "not_now";
  if (/\b(add|change|update|remove|replace|swap|make|include|put|can you|could you|i want|i'd like|we need|please)\b[\s\S]{0,80}\b(logo|colou?rs?|font|page|section|button|photos?|pictures?|images?|video|menu|booking|calendar|form|map|testimonials?|reviews?|gallery|hours|address|phone|text|headline|title|banner|chat|whatsapp|instagram|facebook|feature|header|footer|background|navbar|hero|icon|link|layout|theme)\b/i.test(t) || /\blogo\b/.test(t)) return "change";
  if (/\b(how much|price|pricing|cost|what do you charge|rates?)\b/.test(t)) return "price";
  if (/\b(yes|sure|interested|sounds good|go ahead|send it|send me|let'?s do it|please do|ok(ay)?)\b/.test(t)) return "interested";
  if (/\?/.test(t)) return "question";
  return "other";
}

export interface Suggestion { label: string; body: string }

export function suggestReplies(lead: Pick<VoiieLead, "id" | "handle" | "display_name">, inboundText: string): Suggestion[] {
  const name = leadLabel(lead);
  const link = intakeUrl(lead.id);
  const intent = classifyReply(inboundText);
  const start: Suggestion = {
    label: "Send the start link",
    body: `Thanks for getting back to me. Here's the 30-second link to get your free sample homepage for ${name} (no signup, no cost for the sample):\n${link}\n\nTell me about the business and I'll build it.`,
  };
  const price: Suggestion = {
    label: "Answer pricing",
    body: `Good question. The sample homepage is free. If you like it and want it live on your own domain, plans start at $79.99 (Starter). You decide after you've seen it, and there's no obligation.\n\nYou can start here: ${link}`,
  };
  const how: Suggestion = {
    label: "How it works",
    body: `Happy to explain. You answer four quick questions about ${name}, my AI assistant builds a sample homepage, and you get a link to review it. If you like it, you can pay to publish it; if not, nothing happens.\n\nStart here whenever you're ready: ${link}`,
  };
  const call: Suggestion = {
    label: "Offer a call",
    body: `Happy to talk it through by phone if that's easier. What's a good time and number to reach you?`,
  };
  const thanks: Suggestion = {
    label: "Polite close",
    body: `Understood, thanks for letting me know. I won't email again. If you ever want a free sample, the link stays open: ${link}`,
  };
  const changeOk: Suggestion = {
    label: "Confirm the change",
    body: `Happy to make that change. I'll update your demo and send you the new link shortly. Anything else you want adjusted at the same time?`,
  };
  switch (intent) {
    case "stop": return [];
    case "change": return [changeOk];
    case "not_now": return [thanks];
    case "price": return [price, start];
    case "interested": return [start, call];
    case "question": return [how, price, call];
    default: return [how, start, call];
  }
}
