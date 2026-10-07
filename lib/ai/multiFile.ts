import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  STRUCTURE_SYSTEM_PROMPT,
  EDIT_SYSTEM_PROMPT,
  BACKEND_SYSTEM_ADDENDUM,
  PER_CALL_TIMEOUT_MS,
  CLAUDE_MODEL,
  claudeImageMediaType,
  structureModelFor,
  type ModelTier,
  type BackendContext,
  type StageCallback,
} from "@/lib/ai/orchestrator";
import {
  parseBlocks,
  applyFileEdit,
  validateFileSet,
  findMissingLinks,
  serializeFileBlocks,
  ENTRY_PATH,
  type ProjectFile,
} from "@/lib/projectFilesCore";

// Multi-file generation and edits (Gap 4). Used only when the user asks for a
// multi-file build, or edits a build that already has several files. The
// single-file pipeline in orchestrator.ts is untouched. This path makes one
// model call (plus at most one repair call) and skips the separate Gemini
// design-polish pass, which works on one HTML document.

const FORMAT_RULES = `
OUTPUT FORMAT -- THIS OVERRIDES THE "ONE HTML DOCUMENT" RULES ABOVE. Return a small multi-file project, not a single document.
- Return every file as a block, exactly like this, and nothing else (no commentary, no markdown fences around the whole answer):
=== FILE: index.html ===
<!DOCTYPE html>...
=== FILE: styles.css ===
...
- index.html is required and must be a complete document starting with <!DOCTYPE html>.
- Put CSS in styles.css and JavaScript in app.js (or one .js file per concern). Extra pages go in pages/ (for example pages/about.html) or at the top level. Link files with RELATIVE paths only (styles.css, app.js, pages/about.html, ../index.html from inside pages/). Every page shares the same navigation, styles and script.
- Allowed file types: .html .css .js .json .svg .md .txt. No images or fonts as files: use inline SVG, emoji or an https image URL. At most 12 files, each complete.
- Every file you link to must be one you return. Keep Tailwind via CDN and the Inter font in each page's <head> if the rest of the guidance above calls for them.`;

const EDIT_FORMAT_RULES = `
OUTPUT FORMAT FOR THIS EDIT -- THIS OVERRIDES "COMPLETE HTML DOCUMENT" ABOVE. You will receive ALL the project's files as blocks (=== FILE: path ===). Return ONLY the files you changed or created, each COMPLETE, as blocks in the same format. Do not return files you did not change. To remove a file, write a line: === DELETE: path ===. Never delete index.html. Keep all links between files valid. No commentary.`;

export type MultiFileResult =
  | { ok: true; files: ProjectFile[] }
  | { ok: false; error: string; status: number };

type ModelReply = { ok: true; text: string } | { ok: false; error: string; status: number };

async function callModel(tier: ModelTier, system: string, userText: string, imageDataUrl?: string): Promise<ModelReply> {
  const tooLong = { ok: false as const, error: "That project was too large to finish in one go. Try a smaller scope (fewer pages).", status: 422 };
  if (tier === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The Claude tier is temporarily unavailable.", status: 500 };
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: PER_CALL_TIMEOUT_MS, maxRetries: 1 });
    const content: any = imageDataUrl
      ? [
          { type: "text", text: userText },
          { type: "image", source: { type: "base64", media_type: claudeImageMediaType(imageDataUrl), data: imageDataUrl.split(",")[1] } },
        ]
      : userText;
    try {
      const message = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content }],
      });
      if (message.stop_reason === "max_tokens") return tooLong;
      return { ok: true, text: message.content.map((b: any) => (b.type === "text" ? b.text : "")).join("") };
    } catch (err: any) {
      console.error("[multiFile] Claude request failed:", err?.message || err);
      return { ok: false, error: "Generation failed. Please try again.", status: 502 };
    }
  }

  if (!process.env.OPENAI_API_KEY) return { ok: false, error: "Generation is temporarily unavailable.", status: 500 };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: PER_CALL_TIMEOUT_MS, maxRetries: 1 });
  const content: any = imageDataUrl
    ? [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : userText;
  try {
    const completion = await openai.chat.completions.create({
      model: structureModelFor(tier),
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      max_completion_tokens: 16000,
    });
    if (completion.choices[0]?.finish_reason === "length") return tooLong;
    return { ok: true, text: completion.choices[0]?.message?.content || "" };
  } catch (err: any) {
    console.error("[multiFile] OpenAI request failed:", err?.message || err);
    return { ok: false, error: "Generation failed. Please try again.", status: 502 };
  }
}

function withBackend(text: string, backend?: BackendContext): string {
  return backend
    ? `${text}\n\nCONNECTED SUPABASE PROJECT:\nSUPABASE_URL = ${backend.url}\nSUPABASE_ANON_KEY = ${backend.anonKey}`
    : text;
}

function isCompleteEntry(files: ProjectFile[]): boolean {
  const entry = files.find((f) => f.path === ENTRY_PATH);
  return !!entry && /^\s*<!doctype html/i.test(entry.content) && /<\/html>\s*$/i.test(entry.content.trim());
}

/**
 * Builds a new multi-file project (existing = null) or edits one (existing =
 * its current files). Returns the complete resulting file set.
 */
export async function buildMultiFile(opts: {
  instruction: string;
  existing: ProjectFile[] | null;
  tier: ModelTier;
  imageDataUrl?: string;
  backendContext?: BackendContext;
  onStage?: StageCallback;
}): Promise<MultiFileResult> {
  const { instruction, existing, tier, imageDataUrl, backendContext, onStage } = opts;
  const backendPart = backendContext ? `\n\n${BACKEND_SYSTEM_ADDENDUM}` : "";

  onStage?.("structure");
  let reply: ModelReply;
  if (existing) {
    const system = `${EDIT_SYSTEM_PROMPT}${backendPart}${EDIT_FORMAT_RULES}`;
    const text = withBackend(`EXISTING PROJECT FILES:\n${serializeFileBlocks(existing)}\n\nCHANGE REQUESTED:\n${instruction}`, backendContext);
    reply = await callModel(tier, system, text, imageDataUrl);
  } else {
    const system = `${STRUCTURE_SYSTEM_PROMPT}${backendPart}${FORMAT_RULES}`;
    reply = await callModel(tier, system, withBackend(instruction, backendContext), imageDataUrl);
  }
  if (reply.ok === false) return reply;
  onStage?.("structure_done");

  const parsed = parseBlocks(reply.text);
  if (!parsed || (parsed.files.length === 0 && parsed.deleted.length === 0)) {
    console.error("[multiFile] no file blocks in reply", { length: reply.text.length });
    return { ok: false, error: "Couldn't produce the files for that. Try rephrasing it.", status: 502 };
  }

  let result = existing
    ? applyFileEdit(existing, parsed.files, parsed.deleted)
    : validateFileSet(parsed.files);
  if (result.ok === false) {
    console.error("[multiFile] invalid file set:", result.error);
    return { ok: false, error: `The generated files weren't usable (${result.error}). Please try again.`, status: 502 };
  }
  if (!isCompleteEntry(result.files)) {
    return { ok: false, error: "The generated index.html was incomplete. Please try again.", status: 502 };
  }

  // One bounded repair pass for links to files that were never returned.
  const missing = findMissingLinks(result.files);
  if (missing.length > 0) {
    onStage?.("fixing");
    const repair = await callModel(
      tier,
      `You complete multi-file web projects. Return ONLY the missing files, each complete, as blocks: === FILE: path ===. No commentary.`,
      `PROJECT FILES:\n${serializeFileBlocks(result.files)}\n\nThese files are linked to but missing: ${missing.join(", ")}. Write each of them so the links work and match the project's style.`
    );
    if (repair.ok) {
      const extra = parseBlocks(repair.text);
      if (extra && extra.files.length) {
        const merged = applyFileEdit(result.files, extra.files.filter((f) => missing.includes(f.path)), []);
        if (merged.ok) result = merged;
      }
    }
  }
  return { ok: true, files: result.files };
}
