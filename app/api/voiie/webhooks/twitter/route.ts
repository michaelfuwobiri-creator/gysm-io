import { NextRequest } from "next/server";
import { computeCrcResponse, lookupHandleByUserId } from "@/lib/voiie/twitter";
import { findLeadByContact, getConsultationAnswers } from "@/lib/voiie/db";
import { saveReplyAndAdvance } from "@/lib/voiie/consultation-server";

/** Twitter/X Account Activity API's CRC (Challenge-Response Check) --
 *  required for the webhook URL to validate when you register it. */
export async function GET(req: NextRequest) {
  const crcToken = req.nextUrl.searchParams.get("crc_token");
  if (!crcToken) return new Response("Missing crc_token", { status: 400 });
  return Response.json({ response_token: computeCrcResponse(crcToken) });
}

/** Inbound Direct Messages. Matched to a voiie_leads row by @handle. */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const events = payload?.direct_message_events ?? [];
    const dmEvent = events.find((e: any) => e?.type === "message_create");
    if (!dmEvent) return Response.json({ ok: true });

    const senderId = dmEvent.message_create?.sender_id;
    const text = dmEvent.message_create?.message_data?.text;
    if (!senderId || !text) return Response.json({ ok: true });

    const ownerUserId = process.env.VOIIE_OWNER_USER_ID;
    if (!ownerUserId) {
      console.error("[voiie/webhooks/twitter] VOIIE_OWNER_USER_ID is not configured");
      return Response.json({ ok: true });
    }

    const handle = await lookupHandleByUserId(senderId);
    if (!handle) return Response.json({ ok: true });

    const lead = await findLeadByContact(ownerUserId, { handle });
    if (!lead) {
      console.warn("[voiie/webhooks/twitter] no lead found for handle", handle);
      return Response.json({ ok: true });
    }

    const state = await getConsultationAnswers(lead.id);
    await saveReplyAndAdvance(lead.id, state.currentQuestion, text);
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[voiie/webhooks/twitter] failed to process inbound DM:", error.message);
    return Response.json({ ok: true });
  }
}

export const dynamic = "force-dynamic";
