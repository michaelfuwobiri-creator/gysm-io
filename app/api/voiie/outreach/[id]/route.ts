import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getLead } from "@/lib/voiie/db";
import { sendOutreach, DEFAULT_TEMPLATE } from "@/lib/voiie/outreach";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const channel = body?.channel;
    if (channel !== "whatsapp" && channel !== "email" && channel !== "twitter") {
      return Response.json({ error: "channel must be whatsapp, email, or twitter." }, { status: 400 });
    }
    const template = typeof body?.template === "string" && body.template.trim() ? body.template : DEFAULT_TEMPLATE;

    await sendOutreach(lead.id, channel, template);
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[voiie/outreach] failed:", error.message);
    return Response.json({ error: error.message || "Failed to send outreach." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
