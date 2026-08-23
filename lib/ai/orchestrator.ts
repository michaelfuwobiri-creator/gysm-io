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
- If a reference image is provided alongside the prompt, use it as visual/content inspiration -- subject matter, mood, layout, or style it implies -- for what you build. You don't need to literally recreate the image pixel-for-pixel; capture what it's telling you about the app the user wants.

VISUAL BAR -- build this to look like a funded startup's marketing/product page shipped it, not a wireframe. Default to this house style (the same system GYSM.IO's own homepage uses) unless the request clearly calls for something else:
- Oversized, extremely bold headlines (font-black), tight tracking (tracking-tight or tighter), tight leading (leading-none or leading-[0.9]) for hero/section titles.
- One confident accent identity used consistently and sparingly -- pick a single hue (or a two-color gradient like violet-to-fuchsia) that fits the subject, and apply it to the key headline word via bg-gradient-to-r ... bg-clip-text text-transparent, plus small icon chips and highlights. Don't scatter five unrelated colors.
- Every button and small label is a fully rounded pill (rounded-full): solid black or accent-colored primary buttons, white/light secondary buttons, and tiny bold uppercase-or-badge pills for tags like "Popular" or "New".
- Cards and panels are rounded-2xl (16-24px radius) white (or near-black for dark sections) surfaces with a hairline border (border-black/5 or border-white/10) and a soft shadow, not heavy drop shadows -- add hover:shadow-lg transition on interactive cards.
- Secondary/supporting text uses reduced opacity (opacity-60 / opacity-50 / opacity-40 on the base text color) rather than a separate gray palette.
- Real vertical rhythm: a centered max-w-[1200px]-ish container, generous section spacing, and a hero -> social proof / features -> how it works -> offerings (products, menu, plans) -> FAQ or trust -> closing CTA flow when the app is selling or listing something.
- If it's a selling/marketing-style page, close with a bold, high-contrast CTA band: a full-bleed dark rounded panel with a soft radial gradient glow behind the headline, white bold text, and a light pill button.
- This is the default aesthetic baseline, not a theme to force everywhere -- if the prompt clearly implies a different, well-defined style (e.g. "brutalist", "playful kids app", "dark hacker terminal"), follow that instead, but keep the same bar for spacing, hierarchy, and polish.

CONTENT DEPTH -- shallow, generic output is exactly what a disappointed user is reacting to when they say a generated app looks cheap. Avoid it:
- Populate every list or grid with real depth -- at least 6-9 items for menus, product grids, and feature/testimonial grids, not 3 filler cards padded out with whitespace.
- Write specific, persuasive copy tied to the actual prompt: real-sounding item names, numbers, and descriptions, not "Item 1" or "Feature description goes here." A vague prompt still gets a fully realized, specific product, not a generic template with the blanks half-filled.
- Every interactive element the request implies must actually work end-to-end in the inline script: a cart that updates a running total, filters that actually filter, a form that validates and confirms, a modal that opens and closes. A button that looks real but does nothing is worse than not having the button.
- Think through the full page before writing it: hero, the core interactive experience the app is actually for, supporting sections, and a close -- not just a hero and one lonely content block.`;

const DESIGN_SYSTEM_PROMPT = `You are a senior product designer at a top consumer-SaaS studio doing a visual polish pass on a working HTML prototype. You will be given a complete HTML document that already works. Your job is ONLY to make it look like a beautiful, funded, high-converting product -- not to change what it does.

HARD RULES:
- Improve spacing, type scale, color harmony, visual hierarchy, and add tasteful hover/transition states -- using Tailwind utility classes only (same Tailwind CDN setup already in the document).
- Do NOT change any element's id or any class name that the inline <script> references, and do NOT alter any JavaScript logic, variable names, or event handlers. The app must keep working exactly as it does now -- you are restyling it, not rebuilding it.
- Do NOT remove content, sections, or functionality.
- If the document contains an HTML comment block starting with <!-- GYSM_SCHEMA, copy it into your output byte-for-byte, unchanged, in the same position -- it is machine-parsed database schema, not visual markup, and must survive this pass exactly as given.
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

const EDIT_SYSTEM_PROMPT = `You are the GYSM.IO builder, now editing an app you already built. You'll get the app's complete current HTML and one specific change to make. Apply exactly that change and return the complete updated document -- don't rewrite parts that weren't asked for.

HARD RULES:
- Output ONLY the complete HTML document, starting with <!DOCTYPE html>. No commentary, no markdown fences.
- Preserve everything unrelated to the requested change: existing content, structure, styling, and all working JavaScript (ids, variable names, event handlers) stay intact unless the change specifically requires touching them.
- If the change asks for new interactive behavior, wire it up the same way the existing inline <script> already does things -- vanilla JS only, naming consistent with what's already there.
- Keep the same Tailwind CDN + Inter font setup already in <head>.
- Match the existing visual style (colors, type scale, button and card shapes) for anything you add or change, so it looks like it was designed alongside the rest, not bolted on.
- If the requested change is ambiguous, make the most reasonable, tasteful interpretation rather than leaving it half-done -- there's no way to ask a follow-up here.
- If a reference image is provided alongside the change request, use it as visual/content inspiration for that change.`;

const BACKEND_SYSTEM_ADDENDUM = `
REAL BACKEND -- this build has a connected Supabase project (the user's own, linked via "Connect database"). Use it for real data and real auth instead of localStorage or an in-memory array:
- Load the Supabase client from CDN in <head>, before your inline <script>: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
- At the top of your inline <script>, initialize once with the EXACT values given to you below -- never invent placeholder URLs or keys: const sb = supabase.createClient("SUPABASE_URL_HERE", "SUPABASE_ANON_KEY_HERE");
- Design a minimal Postgres schema for what this app actually needs to persist. Supabase Auth already manages its own users -- do not create your own users/accounts table, reference auth.uid() instead. Output the schema as one HTML comment immediately after the opening <body> tag, in exactly this format (valid Postgres DDL, every table with row level security enabled and policies scoping rows to auth.uid() for anything per-user):
  <!-- GYSM_SCHEMA
  create table if not exists ...;
  alter table ... enable row level security;
  create policy ... on ... for ... using (...);
  GYSM_SCHEMA -->
- Use sb.auth.signUp(...) / sb.auth.signInWithPassword(...) / sb.auth.signOut() for any sign-up, log-in, or log-out control. Use sb.from('table').select()/insert()/update()/delete() for any data the app stores or lists.
- These calls are real network requests -- handle them properly: disable the triggering button while in flight, surface the actual returned error message on failure, only show a success state once the call actually resolves. No fake/instant success, no setTimeout-simulated saves.
- If what's being built genuinely has nothing to persist or authenticate (e.g. a pure calculator, a static informational page), skip the schema block and the Supabase calls entirely -- only wire up what the app actually needs.
`;

export type BackendContext = { url: string; anonKey: string };

export type BuildStage = "structure" | "structure_done" | "design" | "design_done";
export type StageCallback = (stage: BuildStage) => void;

// Model choice -- "fast" is the default Terra tier (cheap, competitive on
// straightforward one-shot generation). "best" switches the structure
// pass to Sol, the flagship tier of the same gpt-5.6 family, for users
// who want a stronger attempt at a complex prompt and are willing to
// spend more credits for it. Costs more (see CREDIT_COST_PER_BUILD_BEST
// in lib/credits-constants.ts) because Sol's output-token cost is
// meaningfully higher than Terra's -- that cost difference is passed
// through honestly rather than eaten silently or charged flat regardless
// of which model actually ran.
export type ModelTier = "fast" | "best";

function structureModelFor(tier: ModelTier): string {
  return tier === "best" ? "gpt-5.6-sol" : "gpt-5.6-terra";
}

export type GenerateResult =
  | { ok: true; html: string }
  | { ok: false; error: string; status: number };

/**
 * Two-model pipeline:
 *  1. OpenAI (GPT-5.6 Terra) generates the working app -- structure,
 *     content, and the vanilla-JS interactivity. This is the only step
 *     that can fail the whole request; it's the part that has to be
 *     correct. Terra (not the flagship Sol tier) is the deliberate choice:
 *     it's the "everyday work" tier, competitive with the previous
 *     flagship on straightforward one-shot code generation like this, at
 *     roughly a sixth of Sol's output-token cost -- Sol is reserved for
 *     genuinely long-horizon agentic work, which a single HTML document
 *     from one prompt is not.
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
export async function generateWebsite(
  prompt: string,
  onStage?: StageCallback,
  imageDataUrl?: string,
  backendContext?: BackendContext,
  tier: ModelTier = "fast"
): Promise<GenerateResult> {
  onStage?.("structure");
  const structure = await generateStructure(prompt, imageDataUrl, backendContext, tier);
  if (!structure.ok) return structure;
  onStage?.("structure_done");

  onStage?.("design");
  const html = await applyDesignPass(structure.html);
  onStage?.("design_done");
  return { ok: true, html };
}

/**
 * Iterative edit pass: takes an existing generated app + a plain-English
 * change request (e.g. "add a shopping cart") and returns the whole app
 * again with just that change applied. Used when a user clicks a
 * post-build suggestion or types a follow-up instead of starting over --
 * cheaper and far more precise than regenerating from the original prompt.
 */
export async function editWebsite(
  existingHtml: string,
  instruction: string,
  onStage?: StageCallback,
  imageDataUrl?: string,
  backendContext?: BackendContext,
  tier: ModelTier = "fast"
): Promise<GenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[orchestrator] OPENAI_API_KEY is not set");
    return { ok: false, error: "Generation is temporarily unavailable.", status: 500 };
  }

  onStage?.("structure");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const editText = backendContext
    ? `EXISTING APP:\n${existingHtml}\n\nCHANGE REQUESTED:\n${instruction}\n\nCONNECTED SUPABASE PROJECT:\nSUPABASE_URL = ${backendContext.url}\nSUPABASE_ANON_KEY = ${backendContext.anonKey}`
    : `EXISTING APP:\n${existingHtml}\n\nCHANGE REQUESTED:\n${instruction}`;
  const editUserContent: any = imageDataUrl
    ? [
        { type: "text", text: editText },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : editText;

  const editSystemPrompt = backendContext ? `${EDIT_SYSTEM_PROMPT}\n\n${BACKEND_SYSTEM_ADDENDUM}` : EDIT_SYSTEM_PROMPT;

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: structureModelFor(tier),
      messages: [
        { role: "system", content: editSystemPrompt },
        { role: "user", content: editUserContent },
      ],
      max_completion_tokens: 16000,
    });
    raw = completion.choices[0]?.message?.content || "";
  } catch (err: any) {
    console.error("[orchestrator] OpenAI edit request failed:", err?.message || err);
    return { ok: false, error: "That edit failed. Please try again.", status: 502 };
  }

  const html = cleanHtml(raw);
  if (!isCompleteHtmlDocument(html)) {
    console.error("[orchestrator] edit did not return a complete HTML document", {
      instructionPreview: instruction.slice(0, 80),
      outputLength: raw.length,
    });
    return { ok: false, error: "Couldn't apply that change. Try rephrasing it.", status: 502 };
  }
  onStage?.("structure_done");

  onStage?.("design");
  const polished = await applyDesignPass(html);
  onStage?.("design_done");
  return { ok: true, html: polished };
}

async function generateStructure(
  prompt: string,
  imageDataUrl?: string,
  backendContext?: BackendContext,
  tier: ModelTier = "fast"
): Promise<GenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[orchestrator] OPENAI_API_KEY is not set");
    return { ok: false, error: "Generation is temporarily unavailable.", status: 500 };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const structureText = backendContext
    ? `${prompt}\n\nCONNECTED SUPABASE PROJECT:\nSUPABASE_URL = ${backendContext.url}\nSUPABASE_ANON_KEY = ${backendContext.anonKey}`
    : prompt;
  const structureUserContent: any = imageDataUrl
    ? [
        { type: "text", text: structureText },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : structureText;
  const structureSystemPrompt = backendContext
    ? `${STRUCTURE_SYSTEM_PROMPT}\n\n${BACKEND_SYSTEM_ADDENDUM}`
    : STRUCTURE_SYSTEM_PROMPT;

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: structureModelFor(tier),
      messages: [
        { role: "system", content: structureSystemPrompt },
        { role: "user", content: structureUserContent },
      ],
      max_completion_tokens: 16000,
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

const SCHEMA_COMMENT_RE = /<!--\s*GYSM_SCHEMA([\s\S]*?)GYSM_SCHEMA\s*-->/;

/** Pulls the DDL out of a <!-- GYSM_SCHEMA ... GYSM_SCHEMA --> comment the
 *  model emits when generating against a connected Supabase project (see
 *  BACKEND_SYSTEM_ADDENDUM). Returns null if the build didn't need one. */
export function extractSchemaSql(html: string): string | null {
  const match = html.match(SCHEMA_COMMENT_RE);
  return match ? match[1].trim() : null;
}

/** Removes the schema comment from the HTML actually shown/saved -- it's
 *  build-time metadata for GYSM.IO's own provisioning step, not something
 *  a user needs to see in "View source" or the code tab. */
export function stripSchemaComment(html: string): string {
  return html.replace(SCHEMA_COMMENT_RE, "").trim();
}
