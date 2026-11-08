// Pings the operator (Mike) on his own WhatsApp when something worth
// seeing happens in the funnel. No-op unless VOIIE_OWNER_WHATSAPP is set
// (E.164, e.g. +385991234567). Never throws -- a failed alert must not
// break the lead flow that triggered it.
//
// Twilio/Meta rule: a business-initiated WhatsApp message outside a 24h
// session needs an approved template. Replying to / messaging the VOIIE
// number from your phone once a day keeps the session open; otherwise
// these alerts may be rejected until a template is approved.

import { sendWhatsAppText } from "@/lib/voiie/whatsapp";

export async function notifyOwner(text: string): Promise<void> {
  const to = process.env.VOIIE_OWNER_WHATSAPP;
  if (!to) return;
  try {
    await sendWhatsAppText(to, `VOIIE: ${text}`);
  } catch (err: any) {
    console.warn("[voiie/notify] owner WhatsApp alert failed:", err?.message || err);
  }
}
