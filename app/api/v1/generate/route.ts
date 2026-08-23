import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/apiKeys";
import { getCreditBalance, deductCredit, CREDIT_COST_PER_BUILD, CREDIT_COST_PER_BUILD_BEST } from "@/lib/credits";
import { generateWebsite, ModelTier, extractSchemaSql, stripSchemaComment } from "@/lib/ai/orchestrator";
import { sql } from "@/lib/db";

// Public, API-key-authenticated generation endpoint -- see
// app/settings/api-keys for where a key is created, lib/apiKeys.ts for
// how it's verified. Deliberately a separate, simpler route rather than
// bolting API-key auth onto app/api/generate/route.ts: that route is a
// tuned NDJSON stream wired tightly to BuilderClient's live build log and
// its "resume an existing project" / "connected backend" / "edit"
// branches. This one does new builds only (no edit/resume), waits for
// the full result instead of streaming it, and always saves as a
// personal build (an API key has no "active org" the way a browser
// session does) -- same underlying generateWebsite() pipeline and the
// same credit accounting, intentionally smaller surface area.
export const maxDuration = 240;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const auth = await verifyApiKey(rawKey);
  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or missing API key. Pass it as \"Authorization: Bearer gysm_live_...\"." },
      { status: 401 }
    );
  }

  let prompt = "";
  let tier: ModelTier = "fast";
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim();
    // Optional: {"tier": "best"} uses the flagship model for 2x credits.
    // Anything else (including omitted) is the default "fast" tier.
    tier = body?.tier === "best" ? "best" : "fast";
  } catch {
    return NextResponse.json({ error: "Invalid request body. Expected JSON: {\"prompt\": \"...\"}." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "\"prompt\" is required." }, { status: 400 });
  }

  const buildCost = tier === "best" ? CREDIT_COST_PER_BUILD_BEST : CREDIT_COST_PER_BUILD;

  const balance = await getCreditBalance(auth.userId);
  if (balance < buildCost) {
    return NextResponse.json({ error: "Out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  const result = await generateWebsite(prompt, undefined, undefined, undefined, tier);
  if (!result.ok) {
    const failure = result as Extract<typeof result, { ok: false }>;
    return NextResponse.json({ error: failure.error }, { status: failure.status || 500 });
  }

  const deducted = await deductCredit(auth.userId, buildCost);
  if (!deducted) {
    return NextResponse.json({ error: "Out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  const schemaSql = extractSchemaSql(result.html);
  const htmlToSave = schemaSql ? stripSchemaComment(result.html) : result.html;

  let projectId: string | null = null;
  try {
    const rows = await sql`
      insert into projects (user_id, prompt, html)
      values (${auth.userId}, ${prompt}, ${htmlToSave})
      returning id
    `;
    projectId = (rows[0] as any)?.id ?? null;
  } catch (error: any) {
    console.error("[v1/generate] failed to save project:", error.message);
  }

  return NextResponse.json({
    projectId,
    html: htmlToSave,
    url: projectId ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/publish/${projectId}` : null,
  });
}

export const dynamic = "force-dynamic";
