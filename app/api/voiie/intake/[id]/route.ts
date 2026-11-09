import { NextRequest } from "next/server";
import { getLeadUnscoped, getConsultationAnswers, updateLeadContact, setDoNotContact, addMessage } from "@/lib/voiie/db";
import { saveReplyAndAdvance } from "@/lib/voiie/consultation-server";
import { VOIIE_QUESTIONS } from "@/lib/voiie/consultation";
import { acceptLeadLink } from "@/lib/voiie/links";
import { buildDemoAndDeliver } from "@/lib/voiie/pipeline";

/** Public, signed-link endpoint behind /start/[id]: takes all 4 answers
 *  in one request, saves them through the same save-and-advance path the
 *  chat channels use, then builds the demo and emails the demo + pay link.
 *  The visitor's browser waits on this (it shows a "building" state); if
 *  they close the tab the autopilot cron finishes the build. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  if (!acceptLeadLink(params.id, body?.sig)) return Response.json({ error: "This link is not valid." }, { status: 403 });

  const lead = await getLeadUnscoped(params.id);
  if (!lead) return Response.json({ error: "Not found." }, { status: 404 });
  // Submitting this form is an explicit request for the demo. If the lead was
  // flagged do-not-contact (often by an email security scanner opening the
  // unsubscribe link, not by the person), this deliberate action lifts it.
  if (lead.do_not_contact) {
    await setDoNotContact(lead.id, false);
    await addMessage(lead.id, "inbound", "system", "Requested a demo via the intake form — do-not-contact lifted.");
  }

  const raw: string[] = Array.isArray(body?.answers) ? body.answers.map((a: unknown) => String(a ?? "").trim()) : [];
  if (raw.length !== VOIIE_QUESTIONS.length || raw.some((a) => !a)) {
    return Response.json({ error: "Please answer all of the questions." }, { status: 400 });
  }
  const contact = raw[VOIIE_QUESTIONS.findIndex((q) => q.key === "contact")];
  if (!contact.includes("@") && contact.replace(/\D/g, "").length < 7) {
    return Response.json({ error: "Enter a valid email or WhatsApp number." }, { status: 400 });
  }

  try {
    const state = await getConsultationAnswers(lead.id);
    // Re-submission after a finished intake just re-delivers (idempotent).
    if (!state.completedAt) {
      for (let i = 0; i < VOIIE_QUESTIONS.length; i++) await saveReplyAndAdvance(lead.id, i, raw[i]);
    }
    await updateLeadContact(lead.id, contact.includes("@") ? { email: contact } : { phone: contact });

    const result = await buildDemoAndDeliver(lead.id);
    return Response.json({ ok: true, demoUrl: result.demoUrl, checkoutUrl: result.checkoutUrl });
  } catch (error: any) {
    console.error("[voiie/intake] failed:", error.message);
    return Response.json(
      { error: "We saved your answers but hit a snag building the demo — we'll email it to you shortly." },
      { status: 500 }
    );
  }
}

export const maxDuration = 240;
export const dynamic = "force-dynamic";
