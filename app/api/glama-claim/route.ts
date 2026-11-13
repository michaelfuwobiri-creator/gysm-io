import { NextResponse } from "next/server";

// Glama (glama.ai) ownership claim for the GYSM MCP connector. Served at
// /api/mcp/.well-known/glama.json through a rewrite in next.config.js.
// The claim token is public by design: it is bound to GYSM's Glama account
// and holds no personal information. Keep it published to stay verified.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    $schema: "https://glama.ai/mcp/schemas/connector.json",
    claim: "glama_claim_Srb3OvIhCpMCIsN5CWAmqJWLfvda-twr",
  });
}
