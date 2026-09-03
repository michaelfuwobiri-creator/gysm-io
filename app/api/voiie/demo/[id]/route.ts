import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getLead, getConsultationAnswers, setDemoProject, addMessage } from "@/lib/voiie/db";
import { buildFreeDemo } from "@/lib/voiie/demo";
import { sendDemoReadyTemplate } from "@/lib/voiie/whatsapp";

/** Builds the free demo (via lib/ai/orchestrator.ts -- see lib/voiie/demo.ts
 *  for why) once the 12-question consultation is done, saves it as a
 *  `projects` row, and -- if the lead gave a phone number -- sends the
 *  WhatsApp "demo ready" template with the live link. Same generous
 *  timeout budget app/api/generate/route.ts gives the same underlying
 *  call. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const { answers } = await getConsultationAnswers(lead.id);
    const demo = await buildFreeDemo(user.id, answers, lead.handle);

    await setDemoProject(lead.id, demo.projectId);

    // Prospects get the tracking-wrapped link (see app/api/voiie/track/[id])
    // so opening it flips demo_sent -> viewed; the dashboard's own preview
    // iframe uses demo.publicUrl directly, untracked, since that's the
    // operator loading it, not the prospect.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
    const trackedUrl = `${siteUrl}/api/voiie/track/${lead.id}?to=${encodeURIComponent(demo.publicUrl)}`;

    await addMessage(lead.id, "outbound", "system", `Free demo ready: ${trackedUrl}`);

    if (lead.contact_phone) {
      try {
        await sendDemoReadyTemplate(lead.contact_phone, answers.business?.name || lead.handle, trackedUrl);
      } catch (error: any) {
        console.error("[voiie/demo] WhatsApp send failed (demo still saved):", error.message);
      }
    }

    return Response.json({ ok: true, projectId: demo.projectId, publicUrl: demo.publicUrl });
  } catch (error: any) {
    console.error("[voiie/demo] failed to build demo:", error.message);
    return Response.json({ error: error.message || "Failed to build demo." }, { status: 500 });
  }
}

export const maxDuration = 240;
export const dynamic = "force-dynamic";
