// Machine-readable "this content is AI-generated" marking, per EU AI Act
// Art. 50(2) -- providers of generative AI must make output "detectable
// as artificially generated" in a machine-readable format, distinct from
// the human-readable label already shown in the footer of
// app/publish/[id]/page.tsx ("AI-generated with GYSM.IO").
//
// v1 here is a standards-lightweight but real implementation: two <meta>
// tags injected into the generated document's <head> at render time
// (applies to every existing build retroactively, no backfill/migration
// needed, and covers custom domains too since middleware.ts rewrites
// those straight to this same page). A fuller implementation would embed
// C2PA-style Content Credentials; this is the reasonable-effort machine-
// readable signal for a document-generation product like GYSM's, and any
// crawler/tool checking for `<meta name="ai-generated">` finds it without
// having to guess.
export function injectAiGeneratedMeta(html: string): string {
  const tags = '<meta name="ai-generated" content="true"><meta name="generator" content="GYSM.IO AI App Builder">';
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}${tags}`);
  }
  // No <head> tag (shouldn't happen for anything the builder itself
  // produced -- see STRUCTURE_SYSTEM_PROMPT in lib/ai/orchestrator.ts,
  // which requires one -- but a manually edited or unusual build might
  // lack one). Fall back to prepending so the marker still ships rather
  // than silently doing nothing.
  return tags + html;
}
