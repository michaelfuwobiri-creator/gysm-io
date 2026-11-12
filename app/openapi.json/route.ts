import { NextResponse } from "next/server";

// OpenAPI 3.1 description of GYSM's public HTTP API, so it can be imported
// into a custom GPT as an Action (ChatGPT) or read by any agent framework.
// /api/blueprint is free and needs no key; /api/v1/generate needs the
// caller's own GYSM API key and spends that account's plan credits.
export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "GYSM API",
    version: "1.0.0",
    description:
      "GYSM turns a plain-English description into a working single-page web app. planApp is free and needs no key. buildApp creates a project in the caller's own account and uses that account's plan credits.",
    contact: { url: `${SITE}/support` },
    termsOfService: `${SITE}/terms`,
  },
  servers: [{ url: SITE }],
  paths: {
    "/api/blueprint": {
      post: {
        operationId: "planApp",
        summary: "Plan an app or an online store from an idea (free, instant, no AI call)",
        description: "Returns the matched use case, page sections, features, suggested data model, integrations, limits, a refined build prompt and a link that opens the GYSM builder. Creates nothing.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  idea: { type: "string", maxLength: 600, description: "What the app should do. Use this for a general plan." },
                  niche: { type: "string", maxLength: 160, description: "What the store sells. Use this instead of idea for an online-store plan." },
                  products: { type: "array", maxItems: 12, items: { type: "string", maxLength: 80 } },
                  currency: { type: "string", description: "ISO code such as EUR or USD." },
                  payments: { type: "string", enum: ["stripe", "thirdweb", "both"] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "A build plan." }, "400": { description: "Missing idea or niche." } },
      },
    },
    "/api/v1/generate": {
      post: {
        operationId: "buildApp",
        summary: "Generate an app in the caller's GYSM account",
        description: "Creates a project in the account that owns the API key and uses that account's plan credits. Only call when the user asked to build now.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: { prompt: { type: "string", maxLength: 1800 }, tier: { type: "string", enum: ["fast", "best"] } },
              },
            },
          },
        },
        responses: {
          "200": { description: "The generated app: project id, HTML and a public share URL." },
          "401": { description: "Missing or invalid API key." },
          "402": { description: "The account has no usage left." },
        },
      },
    },
  },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "A GYSM API key (gysm_live_...) created at /settings/api-keys." } } },
};

export function GET() {
  return NextResponse.json(spec, { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } });
}
