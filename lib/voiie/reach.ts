// "Reach" step: for one lead, pick the best lawful way to put a message in
// front of the owner. Pure (no DB, no network) so it is cheap to test.
//
// Ladder (best first): public email -> WhatsApp (ONLY if the owner opted in)
// -> phone call -> printed card / postal. Cold SMS and cold WhatsApp are never
// offered; the reason is returned so the dashboard can show it.
// Research (Nov 2026, not legal advice):
//  - US cold email: CAN-SPAM, opt-out based, no B2B exception (ftc.gov).
//  - WhatsApp: Meta requires opt-in before business-initiated messages and
//    does not deliver marketing templates to +1 numbers; the Business App
//    terms ban unsolicited messages (developers.facebook.com WhatsApp opt-in docs).
//  - Texts: TCPA consent + 10DLC; Italy art.130 needs prior consent.
//  - Italy: PEC/INI-PEC harvesting for marketing is unlawful (Garante 1 Feb 2018).
//  - Calls: live-operator calls only; Illinois bans 9pm-8am; Italy needs a
//    Registro delle Opposizioni check.

import type { VoiieLead } from "@/types/voiie";
import { coldEmailAllowed, detectRegion } from "@/lib/voiie/compliance";

export type ReachChannel = "email" | "whatsapp" | "call" | "card" | "none";

export interface ReachResult {
  channel: ReachChannel;
  contact: string | null;
  confidence: "high" | "medium" | "low";
  source: string;
  region: string | null;
  notes: string[];
  whatsappLocked: string | null;
  smsDisabled: string;
  pageSearchUrl: string;
}

export function reachTag(channel: ReachChannel): string {
  return `reach:${channel}`;
}

function cityOf(lead: Pick<VoiieLead, "bio">): string {
  const parts = (lead.bio ?? "").split(",").map((s) => s.trim());
  return parts.length >= 3 ? parts[parts.length - 3] : "";
}

export function computeReach(
  lead: Pick<VoiieLead, "platform" | "bio" | "contact_phone" | "contact_email" | "do_not_contact" | "tags" | "display_name" | "handle">,
  optedInWhatsapp: boolean
): ReachResult {
  const region = detectRegion(lead);
  const tags = lead.tags ?? [];
  const name = lead.display_name || lead.handle;
  const notes: string[] = [];
  const base = {
    region,
    notes,
    smsDisabled:
      region === "IT"
        ? "Cold SMS needs prior consent in Italy (Codice Privacy art.130)."
        : "Cold SMS needs prior written consent (TCPA) and a registered 10DLC campaign; not offered.",
    pageSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${name} ${cityOf(lead)} facebook OR instagram`)}`,
  };
  const optedIn = optedInWhatsapp || tags.includes("call:interested");
  const whatsappLocked = optedIn
    ? null
    : "Locked: WhatsApp needs the owner's opt-in first (they message you, or agree on a call). Meta does not allow cold business messages.";

  if (lead.do_not_contact) {
    return { ...base, channel: "none", contact: null, confidence: "low", source: "do-not-contact", whatsappLocked: "Do not contact." };
  }

  if (lead.contact_email) {
    const gate = coldEmailAllowed(lead);
    if (gate.ok) {
      const own = tags.includes("email-from-own-site");
      return {
        ...base,
        channel: "email",
        contact: lead.contact_email,
        confidence: own || lead.platform === "manual" ? "high" : "medium",
        source: own ? "published on the business's own website" : lead.platform === "manual" ? "added manually" : "listing",
        whatsappLocked,
      };
    }
    notes.push(`Email skipped: ${gate.reason}`);
  }

  if (lead.contact_phone && optedIn) {
    return { ...base, channel: "whatsapp", contact: lead.contact_phone, confidence: "high", source: "owner opted in (wrote first or agreed on a call)", whatsappLocked: null };
  }

  if (lead.contact_phone) {
    if (region === "IT") notes.push("Italy: check the Registro delle Opposizioni and give the GDPR notice before calling.");
    return { ...base, channel: "call", contact: lead.contact_phone, confidence: "medium", source: "phone number on the Google listing", whatsappLocked };
  }

  if (lead.bio) {
    return { ...base, channel: "card", contact: lead.bio, confidence: "low", source: "address on the Google listing", whatsappLocked };
  }
  return { ...base, channel: "none", contact: null, confidence: "low", source: "no contact data", whatsappLocked };
}

const TZ: Record<string, string> = { US: "America/Chicago", IT: "Europe/Rome" };

/** Quiet hours in the lead's region (Illinois-centred for the US).
 *  Calls: 9-17 Mon-Fri. Email: 8-20 any day. */
export function quietHours(region: string | null, kind: "call" | "email", now: Date = new Date()): { quiet: boolean; why?: string } {
  const tz = TZ[region ?? "US"] ?? TZ.US;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, weekday: "short" }).formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12", 10) % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekend = wd === "Sat" || wd === "Sun";
  if (kind === "call") {
    if (weekend || hour < 9 || hour >= 17) return { quiet: true, why: `Outside call hours (9-17 Mon-Fri, ${tz} time)` };
  } else if (hour < 8 || hour >= 20) {
    return { quiet: true, why: `Quiet hours (email 8-20, ${tz} time)` };
  }
  return { quiet: false };
}

/** wa.me link that makes the OWNER message our WhatsApp number first (their
 *  opt-in; opens the 24h reply window so the intake bot can answer).
 *  Null when no WhatsApp sender number is configured. */
export function whatsappUsLink(): string | null {
  const digits = (process.env.TWILIO_WHATSAPP_FROM || "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent("Hi! I'd like my free website sample.")}`;
}
