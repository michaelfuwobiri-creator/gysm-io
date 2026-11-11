import { NextRequest, NextResponse } from "next/server";
import { makeBlueprint, makeStoreBlueprint } from "@/lib/blueprint";

// Public, free, no-auth "idea -> build plan" endpoint. Deterministic: it
// makes no AI call and writes nothing, so it cannot spend credits or money.
// Described in /openapi.json so a custom GPT (Actions) can call it. The
// shared per-IP rate limit in middleware.ts already covers every /api route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const idea = req.nextUrl.searchParams.get("idea") || "";
  if (!idea.trim()) return NextResponse.json({ error: "Provide ?idea=..." }, { status: 400, headers: CORS });
  return NextResponse.json(makeBlueprint(idea, { source: "api", medium: "blueprint" }), { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 16_000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers: CORS });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: CORS });
  }
  if (body?.type === "store" || body?.niche) {
    if (typeof body.niche !== "string" || !body.niche.trim()) return NextResponse.json({ error: "\"niche\" is required for a store plan." }, { status: 400, headers: CORS });
    return NextResponse.json(makeStoreBlueprint(body, { source: "api", medium: "store_blueprint" }), { headers: CORS });
  }
  if (typeof body?.idea !== "string" || !body.idea.trim()) return NextResponse.json({ error: "\"idea\" is required." }, { status: 400, headers: CORS });
  return NextResponse.json(makeBlueprint(body.idea, { source: "api", medium: "blueprint" }), { headers: CORS });
}
