import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const STRUCTURE_SYSTEM_PROMPT = `You are the GYSM.IO builder. Generate ONE complete, production-quality HTML document for the user's request.

HARD RULES:
- Output ONLY the HTML document. No markdown code fences, no commentary before or after it.
- Start with <!DOCTYPE html> and include a full <html>...<head>...</head><body>...</body></html>.
- In <head> you MUST include, in this order: <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, and <script src="https://cdn.tailwindcss.com"></script>.
- Style everything with Tailwind utility classes only. Make it look premium: real spacing and hierarchy, rounded corners, hover states, a considered color palette that fits the request.
- Use plain HTML + vanilla JavaScript in a single inline <script> tag for interactivity (cart, search, filters, forms, modals). Do NOT use React, JSX, or any build step -- this runs directly in a sandboxed iframe with no compiler.
- Keep variable and property names consistent throughout your own script -- never introduce a variable under one name and then reference it under another.
- Use https://picsum.photos/seed/UNIQUE-SEED/WIDTH/HEIGHT for placeholder images, with a different seed per image.
- If the request involves selling or listing items (food, products, services, bookings), give every item a name, short description, and a clear price formatted like "$14.99" shown as a badge.
- Always render something complete and believable, even for a vague prompt -- never return an empty page, a "TODO", or placeholder-only content.`;

const DESIGN_SYSTEM_PROMPT = `You are a senior product designer doing a visual polish pass on a working HTML prototype. You will be given a complete HTML document that already works. Your job is ONLY to make it more beautiful.

HARD RULES:
- Improve spacing, type scale, color harmony, visual hierarchy, and add tasteful hover/transition states -- using Tailwind utility classes only (same Tailwind CDN setup already in the document).
- Do NOT change any element's id or any class name that the inline <script> references, and do NOT alter any JavaScript logic, variable names, or event handlers. The app must keep working exactly as it does now -- you are restyling it, not rebuilding it.
- Do NOT remove content, sections, or functionality.
- If you are not confident a change is safe, leave that part unchanged rather than risk breaking it.
- Output ONLY the complete revised HTML document, starting with <!DOCTYPE html>. No commentary, no markdown fences.`;

export type GenerateResult =
  | { ok: true; html: string }
  | { ok: false; error: string; status: number };

/**
 * Two-model pipeline:
 *  1. OpenAI (GPT-4o) generates the working app -- structure, content, and
 *     the vanilla-JS interactivity. This is the only step that can fail the
 *     whole request; it's the part that has to be correct.
 *  2. Gemini takes that working HTML and does a dedicated visual-design
 *     pass -- spacing, type, color, polish -- without touching functionality.
 *     This step is best-effort: if GEMINI_API_KEY isn't set, or the call
 *     fails, or it comes back malformed, generation still succeeds with the
 *     OpenAI output. A user should never see an error because the *design*
 *     step had a bad day, only because generation itself failed.
 *
 * app/api/generate/route.ts stays a thin auth/credits wrapper around this
 * function -- it doesn't know or care that two models are involved.
 */
export async function generateWebsite(prompt: string): Promise<GenerateResult> {
  const structure = await generateStructure(prompt);
  if (!structure.ok) return structure;

  const html = await applyDesignPass(structure.html);
  return { ok: true, html };
}

async function generateStructure(prompt: string): Promise<GenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[orchestrator] OPENAI_API_KEY is not set");
    return { ok: false, error: "Generation is temporarily unavailable.", status: 500 };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });
    raw = completion.choices[0]?.message?.content || "";
  } catch (err: any) {
    console.error("[orchestrator] OpenAI request failed:", err?.message || err);
    return { ok: false, error: "Generation failed. Please try again.", status: 502 };
  }

  const html = cleanHtml(raw);

  if (!isCompleteHtmlDocument(html)) {
    console.error(
      "[orchestrator] model did not return a complete HTML document",
      { promptPreview: prompt.slice(0, 80), outputLength: raw.length }
    );
    return { ok: false, error: "Couldn't generate a preview for that prompt. Try rephrasing.", status: 502 };
  }

  return { ok: true, html };
}

async function applyDesignPass(html: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) return html;

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${DESIGN_SYSTEM_PROMPT}\n\nHTML TO POLISH:\n${html}`,
    });

    const raw = response.text ?? "";
    const polished = cleanHtml(raw);

    if (!isCompleteHtmlDocument(polished)) {
      console.error("[orchestrator] Gemini design pass returned incomplete HTML, keeping OpenAI output");
      return html;
    }
    return polished;
  } catch (err: any) {
    console.error("[orchestrator] Gemini design pass failed, keeping OpenAI output:", err?.message || err);
    return html;
  }
}

/** Strips markdown fences and any stray prose before/after the document. */
function cleanHtml(text: string): string {
  let cleaned = text
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.search(/<!DOCTYPE html/i);
  if (start > 0) cleaned = cleaned.slice(start);

  return cleaned;
}

/** Guards against truncated (max_tokens cut off) or malformed output before
 *  it ever reaches the iframe's srcDoc. */
function isCompleteHtmlDocument(html: string): boolean {
  if (!html) return false;
  if (!/<html[\s>]/i.test(html)) return false;
  if (!html.includes("</html>")) return false;
  return true;
}
