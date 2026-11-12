import { NextRequest, NextResponse } from "next/server";
import { handleMcpBody } from "@/lib/mcp/server";

// GYSM's public MCP endpoint (Streamable HTTP, stateless JSON mode). See
// lib/mcp/server.ts for what it exposes and docs/ecosystem/ for how to list
// it in the Claude and ChatGPT directories. The free planning tools need no
// sign-in; build_app only works if the CALLER sends their own GYSM API key
// as a bearer token, and it forwards that key to /api/v1/generate on this
// same origin (which does the real verification and credit accounting).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY_BYTES = 64 * 1024;

// Browser-based MCP clients call this cross-origin. There are no cookies or
// credentials involved (the only secret is an explicit bearer header the
// caller chooses to send), so a wildcard origin is safe here.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id, accept",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// No server-initiated stream: this server never pushes messages on its own.
export async function GET() {
  return new NextResponse(JSON.stringify({ error: "This MCP server accepts POST only." }), {
    status: 405,
    headers: { ...CORS, allow: "POST, OPTIONS", "content-type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const apiKey = bearer.startsWith("gysm_live_") && bearer.length < 200 ? bearer : undefined;

  const result = await handleMcpBody(body, { apiKey });
  if (result.status === 202 || result.body === undefined) return new NextResponse(null, { status: 202, headers: CORS });
  return NextResponse.json(result.body, { status: result.status, headers: CORS });
}
