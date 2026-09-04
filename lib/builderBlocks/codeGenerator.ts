import type { BuilderBlock } from "./blockDefs";

// Turns the block tree into a real, standalone HTML document -- not JSX,
// because the export target is the same `projects.html` column every
// other GYSM build uses (see db/migrations/0001_init.sql and
// app/publish/[id]/page.tsx, which renders that column in a sandboxed
// iframe via srcDoc). Generating that same shape means Deploy
// (app/api/builder-blocks/[id]/export/route.ts) can hand a block-builder
// project straight into the existing publish/export/dashboard machinery
// instead of duplicating it.
//
// The live canvas preview (BlockRenderer.tsx, rendered inside the Next/
// Clerk app) wires the Auth block to real <SignInButton>/<UserButton>.
// This exported HTML runs standalone in an iframe with no Clerk context,
// so its Auth block is a static visual approximation instead -- flagged
// in a comment in the generated code rather than silently pretending
// exported auth is functional.
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function renderBlock(block: BuilderBlock): string {
  const p = block.props as Record<string, any>;
  switch (block.type) {
    case "header":
      return `<header style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
  <div style="font-weight:900;letter-spacing:-0.02em;">${escapeHtml(p.title)}</div>
  ${p.showAuth ? `<button style="background:#FF0080;color:#fff;border:none;border-radius:999px;padding:8px 18px;font-weight:700;">Sign In</button>` : ""}
</header>`;
    case "hero":
      return `<section style="text-align:center;padding:96px 24px;">
  <h1 style="font-size:48px;font-weight:900;letter-spacing:-0.03em;margin:0 0 16px;">${escapeHtml(p.headline)}</h1>
  <p style="opacity:0.6;font-size:18px;margin:0 0 32px;">${escapeHtml(p.subheadline)}</p>
  <button style="background:#FF0080;color:#fff;border:none;border-radius:999px;padding:14px 32px;font-weight:700;font-size:16px;">${escapeHtml(p.ctaText)}</button>
</section>`;
    case "auth":
      // Static approximation -- see file header comment. Real auth needs
      // a real Clerk (or other) integration wired into wherever this
      // exported HTML actually gets deployed.
      return `<!-- Auth block: static preview only, see codeGenerator.ts header comment -->
<div style="display:flex;justify-content:center;padding:24px;">
  <button style="background:#0A0A0A;color:#fff;border:none;border-radius:999px;padding:10px 24px;font-weight:700;">${escapeHtml(p.buttonText)}</button>
</div>`;
    case "payment":
      return `<section style="max-width:320px;margin:48px auto;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:32px;text-align:center;">
  <div style="font-weight:800;font-size:20px;">${escapeHtml(p.planName)}</div>
  <div style="font-size:36px;font-weight:900;margin:12px 0;">$${escapeHtml(p.price)}<span style="font-size:14px;opacity:0.5;">/mo</span></div>
  <button style="width:100%;background:#FF0080;color:#fff;border:none;border-radius:999px;padding:12px;font-weight:700;">${escapeHtml(p.buttonText)}</button>
</section>`;
    case "chat":
      return `<section style="max-width:480px;margin:24px auto;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;">
  <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);font-weight:700;">${escapeHtml(p.title)}</div>
  <div style="min-height:160px;padding:16px;opacity:0.4;font-size:13px;">No messages yet.</div>
  <div style="padding:12px;border-top:1px solid rgba(255,255,255,0.1);">
    <input placeholder="${escapeHtml(p.placeholder)}" style="width:100%;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:999px;padding:10px 16px;color:inherit;" disabled />
  </div>
</section>`;
    case "database": {
      const fields = String(p.fields || "").split(",").map((f) => f.trim()).filter(Boolean);
      return `<section style="max-width:480px;margin:24px auto;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;">
  <div style="font-weight:700;margin-bottom:8px;">Table: ${escapeHtml(p.tableName)}</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    ${fields.map((f) => `<span style="font-size:12px;background:rgba(255,255,255,0.08);border-radius:999px;padding:4px 10px;">${escapeHtml(f)}</span>`).join("")}
  </div>
</section>`;
    }
    case "form": {
      const fields = String(p.fields || "").split(",").map((f) => f.trim()).filter(Boolean);
      return `<section style="max-width:420px;margin:24px auto;">
  <h3 style="font-weight:800;margin:0 0 16px;">${escapeHtml(p.title)}</h3>
  ${fields
    .map(
      (f) =>
        `<input placeholder="${escapeHtml(f)}" style="width:100%;margin-bottom:10px;background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:10px 14px;color:inherit;" />`
    )
    .join("")}
  <button style="width:100%;background:#FF0080;color:#fff;border:none;border-radius:10px;padding:12px;font-weight:700;">${escapeHtml(p.submitText)}</button>
</section>`;
    }
    case "list": {
      const items = String(p.items || "").split(",").map((i) => i.trim()).filter(Boolean);
      return `<section style="max-width:480px;margin:24px auto;">
  <h3 style="font-weight:800;margin:0 0 12px;">${escapeHtml(p.title)}</h3>
  <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;">
    ${items.map((i) => `<li style="border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 16px;">${escapeHtml(i)}</li>`).join("")}
  </ul>
</section>`;
    }
    case "aiImage":
      return `<section style="max-width:480px;margin:24px auto;">
  <div style="aspect-ratio:16/9;border-radius:16px;background:linear-gradient(135deg,#FF0080,#7C3AED);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;opacity:0.85;text-align:center;padding:16px;">
    AI image: "${escapeHtml(p.prompt)}"
  </div>
</section>`;
    default:
      return "";
  }
}

export function generateHtml(blocks: BuilderBlock[], projectName: string): string {
  const body = blocks.map(renderBlock).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(projectName)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0A0A0A; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
</style>
</head>
<body>
${body || `<div style="padding:96px;text-align:center;opacity:0.4;">Drag a block onto the canvas to get started.</div>`}
</body>
</html>
`;
}
