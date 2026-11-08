// Signed per-lead links (no DB column needed): the self-serve intake page
// and the one-click unsubscribe both carry `?sig=` = HMAC(leadId), so a
// link can only be forged by someone who already holds the server secret.
// Pure server code (node:crypto) -- never import from a client component.

import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.VOIIE_LINK_SECRET || process.env.CRON_SECRET;
  if (!s) throw new Error("VOIIE_LINK_SECRET (or CRON_SECRET) must be set to sign VOIIE links.");
  return s;
}

export function signLead(leadId: string): string {
  return createHmac("sha256", secret()).update(`voiie:${leadId}`).digest("hex").slice(0, 32);
}

export function verifyLeadSig(leadId: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  try {
    const a = Buffer.from(signLead(leadId));
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function site(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
}

export function intakeUrl(leadId: string): string {
  return `${site()}/start/${leadId}?sig=${signLead(leadId)}`;
}

export function unsubscribeUrl(leadId: string): string {
  return `${site()}/api/voiie/unsubscribe?id=${leadId}&sig=${signLead(leadId)}`;
}
