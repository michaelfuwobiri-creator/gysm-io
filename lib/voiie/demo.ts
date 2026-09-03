// Turns a lead's 12 consultation answers into a free, live demo -- by
// calling the SAME generation pipeline gysm.io's own builder uses
// (lib/ai/orchestrator.ts's generateWebsite(), OpenAI structure pass +
// Gemini design pass) and saving the result as a normal row in
// `projects`. That's the whole "hosting" story: a project row is already
// served for free, no auth required, at /publish/[id] (see
// app/publish/[id]/page.tsx) -- VOIIE doesn't need a separate hosting
// system, it just needs to insert a row.
//
// Ownership: the demo project is created under the VOIIE operator's own
// account (ownerUserId -- whoever is running the /voiie dashboard), the
// same way Mike already "owns" every build his own account generates.
// On payment, lib/voiie/billing.ts transfers projects.user_id to the
// newly created customer account -- see convertLeadToCustomer.
//
// Deliberately does NOT go through the credit-check wrapper in
// app/api/generate/route.ts -- that's app-level metering for gysm.io's
// own paying builder users. A VOIIE outbound demo is a business
// development cost the operator incurs to win a customer, not something
// that should be gated behind their own credit balance (which would cap
// how many leads could be hunted per month at whatever their personal
// plan happens to include).

import { generateWebsite } from "@/lib/ai/orchestrator";
import { sql } from "@/lib/db";
import type { LeadAnswers } from "@/types/voiie";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Turns the 12 structured answers into the single natural-language prompt
 *  the orchestrator's system prompt expects -- same shape a human typing
 *  into the builder's textbox would produce, just assembled from the
 *  consultation instead of freeform. */
function answersToPrompt(answers: LeadAnswers, fallbackName: string): string {
  const bizName = answers.business?.name || fallbackName;
  const bizDesc = answers.business?.desc || "a business ready to grow online";
  const pages = answers.pages?.length ? answers.pages : ["Home", "Contact"];
  const features = answers.features ?? [];
  const goal = answers.goal || "Leads";

  const featureLines: string[] = [];
  if (features.includes("Stripe Payments")) featureLines.push("a pricing section with 3 plans (visual only, no real checkout needed)");
  if (features.includes("Bookings") || features.includes("Calendly")) featureLines.push("a visual appointment/booking calendar section");
  if (features.includes("Personal Info Forms")) featureLines.push("a contact/intake form");
  if (features.includes("WhatsApp")) featureLines.push("a floating WhatsApp chat button");

  const lines = [
    `Build a ${answers.appType || "marketing website"} for "${bizName}" -- ${bizDesc}.`,
    `Primary goal: ${goal}.`,
    `Pages/sections needed: ${pages.join(", ")}.`,
  ];
  if (featureLines.length) lines.push(`Also include: ${featureLines.join("; ")}.`);
  if (answers.timeline) lines.push(`Context from the client: ${answers.timeline}.`);
  lines.push("This is a free demo built to win the client's business -- make it look premium and fully realized, not a placeholder.");

  return lines.join(" ");
}

export interface BuiltDemo {
  projectId: string;
  html: string;
  publicUrl: string;
  buildSeconds: number;
}

export async function buildFreeDemo(ownerUserId: string, answers: LeadAnswers, fallbackName: string): Promise<BuiltDemo> {
  const start = Date.now();
  const prompt = answersToPrompt(answers, fallbackName);

  const result = await generateWebsite(prompt);
  let html: string;
  if (result.ok === true) {
    html = result.html;
  } else {
    console.error("[voiie/demo] orchestrator generation failed, using deterministic template fallback:", result.error);
    html = buildTemplateFallback(answers, fallbackName);
  }

  const rows = await sql`
    insert into projects (user_id, prompt, html)
    values (${ownerUserId}, ${prompt}, ${html})
    returning id
  `;
  const projectId = (rows[0] as any).id as string;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const buildSeconds = Math.max(1, Math.round((Date.now() - start) / 1000));

  return { projectId, html, publicUrl: `${siteUrl}/publish/${projectId}`, buildSeconds };
}

/**
 * Deterministic, zero-API-cost fallback used only if the orchestrator
 * call itself fails (missing/rate-limited API key, model error) -- so a
 * hunted lead still gets a real, presentable demo rather than nothing.
 */
function buildTemplateFallback(answers: LeadAnswers, fallbackName: string): string {
  const bizName = esc(answers.business?.name || fallbackName);
  const bizDesc = esc(answers.business?.desc || "A business ready to grow online.");
  const pages = answers.pages?.length ? answers.pages : ["Home", "Contact"];
  const accent = "#FF0080";

  const nav = pages
    .map((p) => `<a href="#" style="color:rgba(255,255,255,.75);text-decoration:none;font-size:13px;font-weight:500;">${esc(p)}</a>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${bizName}</title>
  <style>*{box-sizing:border-box;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;}body{margin:0;background:#08080a;color:#fff;}a{cursor:pointer;}</style></head>
  <body>
    <header style="display:flex;align-items:center;justify-content:space-between;padding:18px 40px;border-bottom:1px solid rgba(255,255,255,.08);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,${accent},#8b5cf6);"></div>
        <span style="font-weight:800;font-size:15px;">${bizName}</span>
      </div>
      <nav style="display:flex;gap:22px;">${nav}</nav>
    </header>
    <section style="padding:90px 40px 70px;text-align:center;background:radial-gradient(circle at 50% 0%,rgba(255,0,128,.14),transparent 60%);">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${accent};text-transform:uppercase;margin-bottom:14px;">Free demo &middot; built by VOIIE</div>
      <h1 style="font-size:42px;font-weight:800;margin:0 0 16px;max-width:640px;margin-left:auto;margin-right:auto;">${bizName}</h1>
      <p style="font-size:16px;color:rgba(255,255,255,.6);max-width:480px;margin:0 auto 28px;">${bizDesc}</p>
      <a style="display:inline-block;background:linear-gradient(135deg,${accent},#8b5cf6);color:#fff;font-weight:700;font-size:14px;padding:13px 28px;border-radius:9999px;">Get Started</a>
    </section>
    <footer style="padding:30px 40px;border-top:1px solid rgba(255,255,255,.08);text-align:center;color:rgba(255,255,255,.35);font-size:12px;">
      Built free in minutes by VOIIE &mdash; a GYSM.IO agent.
    </footer>
  </body></html>`;
}
