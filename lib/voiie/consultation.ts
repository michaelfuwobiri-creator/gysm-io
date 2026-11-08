// The 4-question consultation flow (kept short on purpose: people replying to a
// cold DM drop off fast, and the AI fills in pages/features/copy itself). This is the single source of truth
// for question order/copy -- both app/voiie (the chat UI) and the
// WhatsApp/Twitter/Threads webhook handlers (driving the same flow over
// chat) import from here, so the questions never drift out of sync
// between channels. Pure -- no server-only imports -- so it's safe for
// both client components and server routes to import directly.

import type { LeadAnswers, VoiieQuestion } from "@/types/voiie";

export const VOIIE_QUESTIONS: VoiieQuestion[] = [
  { key: "business", short: "Business", type: "text", prompt: "What's your business name, and what do you do — in one sentence?", placeholder: "e.g. Sara Dental Clinic — checkups, cleanings & cosmetic dentistry in Zagreb" },
  { key: "goal", short: "Goal", type: "single", prompt: "What's the main goal for the site?", options: ["Leads", "Bookings", "Sales", "Credibility"] },
  { key: "experience", short: "Existing site", type: "domain", prompt: "Do you already have a website or domain? Drop the link if so, or say \"no\"." },
  { key: "contact", short: "Delivery", type: "contact", prompt: "Last one — where should we send the free demo? WhatsApp number or email works.", placeholder: "+385... or name@email.com" },
];

export const TOTAL_QUESTIONS = VOIIE_QUESTIONS.length;

export function getQuestionAt(index: number): VoiieQuestion | undefined {
  return VOIIE_QUESTIONS[index];
}

export function getNextQuestion(answers: LeadAnswers): VoiieQuestion | undefined {
  const answeredKeys = new Set(Object.keys(answers ?? {}));
  return VOIIE_QUESTIONS.find((q) => !answeredKeys.has(q.key));
}

export function countAnswered(answers: LeadAnswers): number {
  return Object.keys(answers ?? {}).length;
}

export function allAnswered(answers: LeadAnswers): boolean {
  return countAnswered(answers) >= TOTAL_QUESTIONS;
}

/** Renders a stored answer back to a human-readable line, for chat bubbles + WhatsApp echoes. */
export function answerToText(key: string, value: unknown): string {
  if (value == null) return "";
  if (key === "experience") {
    const v = value as { status?: string; domain?: string };
    return v.status === "existing" ? `Already have a site: ${v.domain || "—"}` : "First-timer, no site yet";
  }
  if (key === "business") {
    const v = value as { name?: string; desc?: string };
    return `${v.name ?? ""} — ${v.desc ?? ""}`;
  }
  if (key === "assets") {
    const v = value as { note?: string; colors?: string; theme?: string };
    return `Uploaded: ${v.note || "logo.png"} · colors ${v.colors ?? "n/a"} · ${v.theme ?? "n/a"} theme`;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Parses a freeform WhatsApp/Twitter/Threads DM reply into an answer for
 * the given question. Structured question types (single/multi) try to
 * match the reply against the option list (case-insensitively,
 * comma-split for multi); anything else -- or no match -- is stored as
 * free text, since a human on WhatsApp won't always reply with the exact
 * button label.
 */
export function parseChatReply(question: VoiieQuestion, rawText: string): unknown {
  const text = rawText.trim();
  if (question.type === "single" && question.options) {
    const match = question.options.find((o) => o.toLowerCase() === text.toLowerCase());
    return match ?? text;
  }
  if (question.type === "multi" && question.options) {
    const parts = text.split(/[,/]|\band\b/i).map((p) => p.trim()).filter(Boolean);
    const matched = parts
      .map((p) => question.options!.find((o) => o.toLowerCase() === p.toLowerCase()) ?? p)
      .filter(Boolean);
    return matched.length ? matched : [text];
  }
  if (question.type === "domain") {
    const hasDomain = /\./.test(text) && !/^no|none|not yet|first.?time/i.test(text);
    return { status: hasDomain ? "existing" : "first-timer", domain: hasDomain ? text : "" };
  }
  if (question.key === "business") {
    const [name, ...rest] = text.split(/[-–—]/);
    return { name: (name ?? text).trim(), desc: rest.join("-").trim() || "No description provided yet." };
  }
  return text;
}
