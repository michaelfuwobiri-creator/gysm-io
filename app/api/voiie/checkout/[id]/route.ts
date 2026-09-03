import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getLead, addMessage } from "@/lib/voiie/db";
import { createVoiieCheckoutSession } from "@/lib/voiie/billing";
import { sendWhatsAppText } from "@/lib/voiie/whatsapp";
import type { VoiiePlanId } from "@/types/voiie";

const VALID_PLANS: VoiiePlanId[] = ["voiie_starter", "voiie_pro", "voiie_agency"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const body = await req.json();
    const planId = body?.planId as VoiiePlanId;
    if (!VALID_PLANS.includes(planId)) {
      return Response.json({ error: `planId must be one of ${VALID_PLANS.join(", ")}.` }, { status: 400 });
    }

    const { url } = await createVoiieCheckoutSession(lead.id, planId);

    const message = `Here's your link to take the free demo live: ${url}`;
    await addMessage(lead.id, "outbound", "system", message);
    if (lead.contact_phone) {
      try {
        await sendWhatsAppText(lead.contact_phone, message);
      } catch (error: any) {
        console.error("[voiie/checkout] WhatsApp send failed (checkout link still created):", error.message);
      }
    }

    return Response.json({ url });
  } catch (error: any) {
    console.error("[voiie/checkout] failed:", error.message);
    return Response.json({ error: error.message || "Could not start checkout." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
