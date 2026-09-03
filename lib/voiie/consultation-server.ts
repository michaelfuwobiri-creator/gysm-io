// Server-only half of the consultation flow (touches @/lib/db) -- kept
// out of lib/voiie/consultation.ts on purpose, since that file's question
// list + pure helpers are imported directly into client components to
// keep question copy in sync between the dashboard UI and the server.
//
// Used by both app/api/voiie/consultation/[id]/route.ts (the dashboard's
// "answer on the client's behalf" path, and the one real inbound-reply
// path shares too) and the WhatsApp/Twitter webhook routes -- same
// save-and-advance logic either way, so a lead gets the exact same
// question sequence whether they're replying by WhatsApp, Twitter DM, or
// being walked through it live on a call.

import { VOIIE_QUESTIONS, TOTAL_QUESTIONS, answerToText, parseChatReply } from "@/lib/voiie/consultation";
import { getLeadUnscoped, saveConsultationAnswer, addMessage, updateLeadStatus } from "@/lib/voiie/db";
import type { LeadAnswers } from "@/types/voiie";

export interface AdvanceResult {
  leadId: string;
  answers: LeadAnswers;
  nextQuestionIndex: number;
  allAnswered: boolean;
}

/** Parses a freeform reply against the CURRENT question (by index), saves
 *  it, logs both sides of the exchange on the message timeline, and
 *  returns the next question index. */
export async function saveReplyAndAdvance(leadId: string, currentIndex: number, rawReply: string): Promise<AdvanceResult> {
  const question = VOIIE_QUESTIONS[currentIndex];
  if (!question) throw new Error("Consultation is already complete for this lead.");

  const lead = await getLeadUnscoped(leadId);
  if (!lead) throw new Error("Lead not found.");

  const answer = parseChatReply(question, rawReply);
  const nextIndex = currentIndex + 1;
  const nextQuestion = VOIIE_QUESTIONS[nextIndex];
  const allAnswered = nextIndex >= TOTAL_QUESTIONS;

  const answers = await saveConsultationAnswer(leadId, question.key, answer, nextIndex, allAnswered);

  await addMessage(leadId, "inbound", "system", answerToText(question.key, answer), { questionKey: question.key });
  await addMessage(
    leadId,
    "outbound",
    "system",
    nextQuestion ? nextQuestion.prompt : "That's everything I need — 12/12! Building your free demo now. ✨"
  );

  if (lead.status === "new" || lead.status === "contacted") await updateLeadStatus(leadId, "consulting");

  return { leadId, answers, nextQuestionIndex: nextIndex, allAnswered };
}
