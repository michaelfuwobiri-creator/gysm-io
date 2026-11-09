// Safe-by-default rules for who VOIIE may cold-contact, and how.
//
// Research basis (Nov 2026; not legal advice):
//  - US: CAN-SPAM has no B2B exception but is opt-out based -- it requires an
//    honest sender, a postal address and a working opt-out honored within 10
//    business days (ftc.gov CAN-SPAM compliance guide). Cold B2B email is allowed.
//  - Italy/EU: ePrivacy Art. 13 / Codice Privacy art. 130 treat unsolicited
//    marketing email as opt-in, and sources conflict on whether even a generic
//    info@ company address is tolerated. Germany (UWG §7) is opt-in even for B2B.
//    So the default here is: NO automated cold email outside the allow-list.
//  - WhatsApp: Meta requires opt-in before ANY business-initiated message
//    (developers.facebook.com WhatsApp "Getting opt-in"). Cold WhatsApp to
//    scraped phone numbers violates that policy and risks the number being
//    banned, so WhatsApp is only used after the lead has written to us first.
//  - US SMS: TCPA needs prior express written consent for marketing texts, so
//    cold SMS is not offered at all.

import type { VoiieLead } from "@/types/voiie";

/** Country (ISO-ish) from the end of a Google formatted address, e.g. "..., USA". */
const COUNTRY_NAMES: Record<string, string> = {
  usa: "US", "united states": "US", us: "US",
  italy: "IT", italia: "IT",
  "united kingdom": "GB", uk: "GB",
  germany: "DE", deutschland: "DE",
  france: "FR", spain: "ES", españa: "ES",
  canada: "CA", australia: "AU", "new zealand": "NZ", ireland: "IE", netherlands: "NL", portugal: "PT",
  croatia: "HR", austria: "AT", switzerland: "CH", belgium: "BE",
};

const PHONE_PREFIXES: Array<[string, string]> = [
  ["39", "IT"], ["44", "GB"], ["49", "DE"], ["33", "FR"], ["34", "ES"], ["353", "IE"],
  ["31", "NL"], ["351", "PT"], ["385", "HR"], ["43", "AT"], ["41", "CH"], ["32", "BE"], ["61", "AU"], ["64", "NZ"],
];

export function detectRegion(lead: Pick<VoiieLead, "bio" | "contact_phone">): string | null {
  const last = (lead.bio ?? "").split(",").pop()?.trim().toLowerCase();
  if (last && COUNTRY_NAMES[last]) return COUNTRY_NAMES[last];

  const digits = (lead.contact_phone ?? "").replace(/\D/g, "");
  if (digits) {
    for (const [prefix, region] of PHONE_PREFIXES) if (digits.startsWith(prefix)) return region;
    // +1 is both the US and Canada (CASL = opt-in), so only trust it with an
    // explicit US address; a bare +1 number stays "unknown".
  }
  return null;
}

/** Regions where automated cold B2B email is allowed. Default: US only.
 *  Override with VOIIE_COLD_EMAIL_REGIONS="US,GB" after getting local advice. */
export function coldEmailRegions(): string[] {
  return (process.env.VOIIE_COLD_EMAIL_REGIONS || "US")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function regionAllowsColdEmail(region: string | null): boolean {
  return !!region && coldEmailRegions().includes(region);
}

/** Gate for the unattended autopilot. Manual leads (Mike's own test
 *  addresses, or contacts who asked to be reached) are not region-gated. */
export function coldEmailAllowed(lead: Pick<VoiieLead, "platform" | "bio" | "contact_phone" | "contact_email" | "do_not_contact">): {
  ok: boolean;
  reason?: string;
} {
  if ((lead as any).do_not_contact) return { ok: false, reason: "do-not-contact" };
  if (!lead.contact_email) return { ok: false, reason: "no email" };
  if (lead.platform === "manual") return { ok: true };
  const region = detectRegion(lead);
  if (!regionAllowsColdEmail(region)) {
    return { ok: false, reason: `cold email not enabled for region ${region ?? "unknown"} (allowed: ${coldEmailRegions().join(",")})` };
  }
  return { ok: true };
}

/** CAN-SPAM requires a valid physical postal address in every commercial
 *  email. Cold email to real prospects is refused until it is configured. */
export function postalAddressConfigured(): boolean {
  return !!(process.env.VOIIE_POSTAL_ADDRESS && process.env.VOIIE_POSTAL_ADDRESS.trim().length > 8);
}

const STOP_WORDS = /^\s*(stop|stop all|unsubscribe|cancel|end|quit|optout|opt out|remove|basta|annulla|cancella|disiscrivi|non scrivermi|no grazie)\s*[.!]*\s*$/i;

/** True when an inbound message is an opt-out request (EN + IT keywords). */
export function isOptOutMessage(text: string): boolean {
  return STOP_WORDS.test(text || "");
}
