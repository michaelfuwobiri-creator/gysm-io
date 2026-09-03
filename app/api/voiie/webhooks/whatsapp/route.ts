import { NextRequest } from "next/server";
import { verifyWebhookChallenge, verifyWebhookSignature, parseIncomingMessage } from "@/lib/voiie/whatsapp";
import { findLeadByContact, getConsultationAnswers } from "@/lib/voiie/db";
import { saveReplyAndAdvance } from "@/lib/voiie/consultation-server";

/** Meta's verification handshake when you (re-)register this URL in
 *  Meta for Developers -> WhatsApp -> Configuration -> Webhook. */
export async function GET(req: NextRequest) {
  const challenge = verifyWebhookChallenge(req.nextUrl.searchParams);
  if (challenge === null) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200 });
}

/** Inbound WhatsApp messages. A lead is matched to their voiie_leads row
 *  by phone number (set once they answer the "contact" question -- see
 *  app/api/voiie/consultation/[id]/route.ts) and searched across every
 *  owner, since a webhook request carries no signed-in user. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const incoming = parseIncomingMessage(payload);
  if (!incoming) return Response.json({ ok: true }); // status update / non-text event -- nothing to do

  try {
    // WHATSAPP_OWNER_USER_ID: whichever GYSM.IO account this WhatsApp
    // Business number is registered to receive leads for. This app is
    // single-operator today (see db/migrations/0016_voiie.sql's comment
    // on owner_user_id) -- a multi-operator setup would instead route by
    // the destination phone number id in the webhook payload.
    const ownerUserId = process.env.VOIIE_OWNER_USER_ID;
    if (!ownerUserId) {
      console.error("[voiie/webhooks/whatsapp] VOIIE_OWNER_USER_ID is not configured");
      return Response.json({ ok: true });
    }

    const lead = await findLeadByContact(ownerUserId, { phone: incoming.from });
    if (!lead) {
      console.warn("[voiie/webhooks/whatsapp] no lead found for phone", incoming.from);
      return Response.json({ ok: true });
    }

    const state = await getConsultationAnswers(lead.id);
    await saveReplyAndAdvance(lead.id, state.currentQuestion, incoming.text);
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[voiie/webhooks/whatsapp] failed to process inbound message:", error.message);
    return Response.json({ ok: true }); // ack anyway -- Meta retries on non-2xx
  }
}

export const dynamic = "force-dynamic";
