import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getLead, getConsultationAnswers, updateLeadContact, updateLeadStatus, addMessage } from "@/lib/voiie/db";
import { intakeUrl } from "@/lib/voiie/links";
import { saveReplyAndAdvance } from "@/lib/voiie/consultation-server";
import { getQuestionAt } from "@/lib/voiie/consultation";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const state = await getConsultationAnswers(lead.id);
    const currentQuestion = getQuestionAt(state.currentQuestion) ?? null;
    return Response.json({ ...state, currentQuestion });
  } catch (error: any) {
    console.error("[voiie/consultation/:id] failed to load:", error.message);
    return Response.json({ error: "Failed to load consultation." }, { status: 500 });
  }
}

/** Answers the current question on the lead's behalf -- used by the
 *  dashboard's chat panel to walk a consultation forward (e.g. relaying
 *  what a client said on a call), and by the WhatsApp/Twitter webhook
 *  routes for the real inbound-reply path. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const body = await req.json();

    // "Start consultation": opens the consultation on this lead with NO demo
    // and sends nothing to anyone. Moves new/contacted -> consulting, logs the
    // first question, and returns the signed intake link for the operator to
    // give the owner by hand (read out, own-phone text, own WhatsApp). The demo
    // is built later, only after the 4 questions are answered.
    if (body?.start === true) {
      if (lead.do_not_contact) return Response.json({ error: "This lead is marked do-not-contact." }, { status: 400 });
      if (lead.status === "new" || lead.status === "contacted") {
        await updateLeadStatus(lead.id, "consulting");
        const first = getQuestionAt(0);
        await addMessage(
          lead.id,
          "outbound",
          "system",
          `Consultation started (no demo yet). First question: ${first?.prompt ?? ""}`
        );
      }
      return Response.json({ ok: true, link: intakeUrl(lead.id) });
    }

    const reply = (body?.reply ?? "").toString();
    if (!reply.trim()) return Response.json({ error: "Reply text is required." }, { status: 400 });

    const state = await getConsultationAnswers(lead.id);
    const result = await saveReplyAndAdvance(lead.id, state.currentQuestion, reply);

    // The last question ("contact") collects the delivery address -- once
    // it's answered, store it on the lead itself so demo.ts/outreach.ts
    // don't have to reach back into the answers blob to find it.
    if (result.answers.contact) {
      const contact = String(result.answers.contact);
      const isEmail = contact.includes("@");
      await updateLeadContact(lead.id, isEmail ? { email: contact } : { phone: contact });
    }

    const nextQuestion = getQuestionAt(result.nextQuestionIndex) ?? null;
    return Response.json({ ...result, nextQuestion });
  } catch (error: any) {
    console.error("[voiie/consultation/:id] failed to advance:", error.message);
    return Response.json({ error: error.message || "Failed to save reply." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
