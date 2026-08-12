import OpenAI from "openai";

const SYSTEM_PROMPT = `You are the GYSM.IO builder. Generate ONE complete, production-quality HTML document for the user's request.

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

export type GenerateResult =
  | { ok: true; html: string }
  | { ok: false; error: string; status: number };

/**
 * Calls OpenAI GPT-4o and returns a full standalone HTML document (Tailwind CDN
 * + vanilla JS), or a structured error. This is the ONLY place that talks to the
 * model -- app/api/generate/route.ts should stay a thin auth/credits wrapper
 * around this function.
 *
 * Previous versions of this pipeline asked the model for a bare JSX component
 * and transpiled it client-side with Babel standalone inside the iframe. That
 * is what caused the white-screen bug: any parse error in the AI's JSX (extra
 * prose, a stray character) fails silently in the browser console with nothing
 * shown to the user, and Babel-in-the-browser has no tolerance for imperfect
 * input. Emitting plain HTML sidesteps that whole failure class -- browsers
 * render imperfect HTML best-effort instead of going blank.
 */
export async function generateWebsite(prompt: string): Promise<GenerateResult> {
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
        { role: "system", content: SYSTEM_PROMPT },
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
