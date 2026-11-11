import { NextResponse } from "next/server";

// Domain-verification challenge for submitting the GYSM MCP server to the
// ChatGPT app directory. OpenAI's dashboard shows a token; set it as the
// OPENAI_APPS_CHALLENGE environment variable in Vercel and this route serves
// it as plain text at /.well-known/openai-apps-challenge. With the variable
// unset the path is a normal 404, so nothing is exposed until you opt in.
export const dynamic = "force-dynamic";

export function GET() {
  const token = (process.env.OPENAI_APPS_CHALLENGE || "").trim();
  if (!token) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(token, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
