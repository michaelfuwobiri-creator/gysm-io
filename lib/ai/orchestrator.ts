import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const STRUCTURE_SYSTEM_PROMPT = `You are the GYSM.IO builder. Generate ONE complete, production-quality HTML document for the user's request.

HARD RULES:
- Output ONLY the HTML document. No markdown code fences, no commentary before or after it.
- Start with <!DOCTYPE html> and include a full <html>...<head>...</head><body>...</body></html>.
- In <head> you MUST include, in this order: <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, and <script src="https://cdn.tailwindcss.com"></script>.
- Also load the Inter font in <head>: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"> and set it as the base font on <body> (font-family: Inter, sans-serif).
- Use plain HTML + vanilla JavaScript in a single inline <script> tag for interactivity (cart, search, filters, forms, modals). Do NOT use React, JSX, or any build step -- this runs directly in a sandboxed iframe with no compiler.
- Keep variable and property names consistent throughout your own script -- never introduce a variable under one name and then reference it under another.
- Use https://picsum.photos/seed/UNIQUE-SEED/WIDTH/HEIGHT for placeholder images, with a different seed per image.
- If the request involves selling or listing items (food, products, services, bookings), give every item a name, short description, and a clear price formatted like "$14.99" shown as a badge.
- Always render something complete and believable, even for a vague prompt -- never return an empty page, a "TODO", or placeholder-only content.

VISUAL BAR -- build this to look like a funded startup's marketing/product page shipped it, not a wireframe. Default to this house style (the same system GYSM.IO's own homepage uses) unless the request clearly calls for something else:
- Oversized, extremely bold headlines (font-black), tight tracking (tracking-tight or tighter), tight leading (leading-none or leading-[0.9]) for hero/section titles.
- One confident accent identity used consistently and sparingly -- pick a single hue (or a two-color gradient like violet-to-fuchsia) that fits the subject, and apply it to the key headline word via bg-gradient-to-r ... bg-clip-text text-transparent, plus small icon chips and highlights. Don't scatter five unrelated colors.
- Every button and small label is a fully rounded pill (rounded-full): solid black or accent-colored primary buttons, white/light secondary buttons, and tiny bold uppercase-or-badge pills for tags like "Popular" or "New".
- Cards and panels are rounded-2xl (16-24px radius) white (or near-black for dark sections) surfaces with a hairline border (border-black/5 or border-white/10) and a soft shadow, not heavy drop shadows -- add hover:shadow-lg transition on interactive cards.
- Secondary/supporting text uses reduced opacity (opacity-60 / opacity-50 / opacity-40 on the base text color) rather than a separate gray palette.
- Real vertical rhythm: a centered max-w-[1200px]-ish container, generous section spacing, and a hero -> social proof / features -> how it works -> offerings (products, menu, plans) -> FAQ or trust -> closing CTA flow when the app is selling or listing something.
- If it's a selling/marketing-style page, close with a bold, high-contrast CTA band: a full-bleed dark rounded panel with a soft radial gradient glow behind the headline, white bold text, and a light pill button.
- This is the default aesthetic baseline, not a theme to force everywhere -- if the prompt clearly implies a different, well-defined style (e.g. "brutalist", "playful kids app", "dark hacker terminal"), follow that instead, but keep the same bar for spacing, hierarchy, and polish.`;

const DESIGN_SYSTEM_PROMPT = `You are a senior product designer at a top consumer-SaaS studio doing a visual polish pass on a working HTML prototype. You will be given a complete HTML document that already works. Your job is ONLY to make it look like a beautiful, funded, high-converting product -- not to change what it does.

HARD RULES:
- Improve spacing, type scale, color harmony, visual hierarchy, and add tasteful hover/transition states -- using Tailwind utility classes only (same Tailwind CDN setup already in the document).
- Do NOT change any element's id or any class name that the inline <script> references, and do NOT alter any JavaScript logic, variable names, or event handlers. The app must keep working exactly as it does now -- you are restyling it, not rebuilding it.
- Do NOT remove content, sections, or functionality.
- If you are not confident a change is safe, leave that part unchanged rather than risk breaking it.
- Output ONLY the complete revised HTML document, starting with <!DOCTYPE html>. No commentary, no markdown fences.

DESIGN TARGET -- push the document toward this house style (the same system GYSM.IO's own marketing site uses) unless the existing design has a clear, different intentional theme worth preserving:
- Typography: load/keep Inter, push headline weights to font-black with tight tracking and tight leading so hero and section titles feel confident and oversized; body copy stays comfortably readable at a lighter weight.
- Accent: consolidate onto one confident accent identity (a single hue or a violet-to-fuchsia-style two-color gradient works well) applied to the key headline word or phrase via bg-clip-text, to primary CTAs, and to small icon chips -- remove competing, unrelated accent colors.
- Buttons and badges: make every button and small tag a fully rounded pill (rounded-full), bold label text, generous horizontal padding.
- Cards/surfaces: rounded-2xl white (or near-black on dark sections) panels with a hairline border and a soft shadow; add hover:shadow-lg transition where a card is clickable.
- Hierarchy: convert gray/muted text to opacity-based secondary text (opacity-60/50/40) on the base ink color instead of a separate gray scale, for a more cohesive look.
- Rhythm: even out section spacing and center content in a consistent max-width container; tighten anything cramped, loosen anything crowded.
- If the page sells or lists something and doesn't already end with one, add a closing high-contrast CTA moment (a dark rounded band with a subtle radial gradient glow works well) -- but only if you can do this without touching any element the script depends on.`;

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
      model: "gemini-3.6-flash",
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
