// GYSM's remote MCP server (Model Context Protocol), stateless JSON mode.
//
// Mounted at POST /api/mcp (app/api/mcp/route.ts). It is deliberately
// dependency-free: a small JSON-RPC 2.0 handler for the three MCP methods a
// tools-only server needs (initialize, tools/list, tools/call) plus ping, so
// it can be unit-tested without a framework and cannot be broken by an SDK
// upgrade. It speaks the Streamable HTTP transport in its simplest legal form:
// every POST gets one application/json response, GET returns 405 (no
// server-initiated SSE stream), and there are no sessions.
//
// What it exposes (all free, read-only planning tools that need no sign-in,
// which is what makes the server listable in public directories):
//   plan_app, plan_online_store, list_use_cases, compare_ai_app_builders,
//   get_build_link
// plus one write tool, build_app, that only works when the CALLER passes
// their own GYSM API key (Authorization: Bearer gysm_live_...). It forwards
// to the existing /api/v1/generate endpoint, so credits, plan limits and key
// verification stay exactly where they already live. Without a key it does
// nothing except explain how to continue in the builder.

import {
  LANDING_USE_CASES,
  USE_CASES,
  SITE_URL,
  buildDeepLink,
  cleanText,
  makeBlueprint,
  makeStoreBlueprint,
} from "@/lib/blueprint";
import { CHECKED_ON, GYSM_FACTS, RIVALS } from "@/lib/comparisons";
import { STORE_TOOL_DEFS } from "@/lib/agentCore";

export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_VERSION = "1.1.0";

type Json = Record<string, unknown>;
type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Json };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export type McpContext = {
  /** GYSM API key from the Authorization header, if the caller sent one. */
  apiKey?: string;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: unknown; isError?: boolean };

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  annotations: { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run: (args: Json, ctx: McpContext) => Promise<ToolResult> | ToolResult;
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function ok(text: string, structured?: unknown): ToolResult {
  return { content: [{ type: "text", text }], ...(structured !== undefined ? { structuredContent: structured } : {}) };
}
function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

const TOOLS: Tool[] = [
  {
    name: "plan_app",
    title: "Plan a web app from an idea",
    description:
      "Turn a plain-English app idea into a build plan: matched use case, page sections, features, a suggested data model, integrations, honest limits, a refined build prompt and a link that opens the GYSM builder with that prompt. Free and instant: it makes no AI call, creates nothing and changes nothing. It is a plan, not a generated app.",
    inputSchema: {
      type: "object",
      properties: { idea: { type: "string", description: "What the app should do and who it is for, in plain English (max 600 characters).", maxLength: 600 } },
      required: ["idea"],
      additionalProperties: false,
    },
    annotations: { title: "Plan a web app from an idea", ...READ_ONLY },
    run: (args) => {
      const idea = cleanText(args.idea);
      if (!idea) return fail("Please describe the app idea in a sentence or two.");
      const bp = makeBlueprint(idea, { source: "mcp", medium: "plan_app" });
      const text = [
        `Matched use case: ${bp.useCase.name}${bp.useCase.matched ? "" : " (no close match, using a generic plan)"}`,
        `For: ${bp.audience}`,
        "",
        "Sections:",
        bullets(bp.sections),
        "",
        "Features:",
        bullets(bp.features),
        "",
        "Suggested data model (only stored if the user connects their own Supabase project):",
        bullets(bp.data.map((d) => `${d.table}: ${d.fields.join(", ")}`)),
        "",
        "Integrations:",
        bullets(bp.integrations),
        "",
        "Limits to be upfront about:",
        bullets(bp.limits),
        "",
        `Refined build prompt: ${bp.buildPrompt}`,
        `Open in the GYSM builder: ${bp.buildLink}`,
        "",
        bp.note,
      ].join("\n");
      return ok(text, bp);
    },
  },
  {
    name: "plan_online_store",
    title: "Plan an online store page",
    description:
      "Plan a small online store: page sections, product features, checkout options (Stripe Payment Links and/or thirdweb card-or-crypto checkout, both set up in the seller's own accounts), a compliance checklist, a launch checklist, honest limits and a link that opens the GYSM builder with a ready-made prompt. Free and instant: it makes no AI call and creates nothing. GYSM generates a single storefront page, not a full Shopify replacement.",
    inputSchema: {
      type: "object",
      properties: {
        niche: { type: "string", description: "What the store sells, e.g. 'handmade candles' (max 160 characters).", maxLength: 160 },
        products: {
          type: "array",
          maxItems: 12,
          description: "Optional product names, or objects with name and price.",
          items: { anyOf: [{ type: "string", maxLength: 80 }, { type: "object", properties: { name: { type: "string", maxLength: 80 }, price: { type: "string", maxLength: 24 } }, required: ["name"], additionalProperties: false }] },
        },
        currency: { type: "string", description: "ISO currency code such as EUR, USD or GBP. Defaults to EUR." },
        payments: { type: "string", enum: ["stripe", "thirdweb", "both"], description: "Which checkout option to plan for. Defaults to stripe." },
      },
      required: ["niche"],
      additionalProperties: false,
    },
    annotations: { title: "Plan an online store page", ...READ_ONLY },
    run: (args) => {
      if (!cleanText(args.niche, 160)) return fail("Please say what the store sells, for example 'handmade candles'.");
      const bp = makeStoreBlueprint(args, { source: "mcp", medium: "plan_online_store" });
      const text = [
        `Store: ${bp.niche} (${bp.currency})`,
        bp.products.length ? `Products: ${bp.products.map((p) => (p.price ? `${p.name} (${p.price})` : p.name)).join("; ")}` : "Products: none given, the page will use placeholders",
        "",
        "Page sections:",
        bullets(bp.sections),
        "",
        "Checkout options:",
        ...bp.checkout.flatMap((c) => [`${c.option}: ${c.howItWorks}`, "  The seller does:", ...c.youDoYourself.map((y) => `  - ${y}`)]),
        "",
        "Compliance checklist (general information, not legal advice):",
        bullets(bp.compliance),
        "",
        "Launch checklist:",
        bullets(bp.launchChecklist),
        "",
        "Limits to be upfront about:",
        bullets(bp.limits),
        "",
        `Build prompt: ${bp.buildPrompt}`,
        `Open in the GYSM builder: ${bp.buildLink}`,
        "",
        bp.note,
      ].join("\n");
      return ok(text, bp);
    },
  },
  {
    name: "list_use_cases",
    title: "List supported use cases",
    description: "List the kinds of sites and apps GYSM plans well (online store, restaurant, coaching, portfolio, event page, nonprofit, booking, SaaS and more) with an example prompt and a page for each. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "List supported use cases", ...READ_ONLY },
    run: () => {
      const items = USE_CASES.map((u) => ({ slug: u.slug, name: u.name, audience: u.audience, examplePrompt: u.examplePrompt, page: u.path ? `${SITE_URL}${u.path}` : null }));
      const text = items.map((u) => `${u.name}: ${u.audience}\n  Example: ${u.examplePrompt}${u.page ? `\n  Page: ${u.page}` : ""}`).join("\n");
      return ok(text, { useCases: items });
    },
  },
  {
    name: "compare_ai_app_builders",
    title: "Compare AI app builders",
    description:
      "Sourced comparison of GYSM against Lovable, Bolt, v0, Base44 and Replit: pricing and allowances as listed on each product's own pricing page on the stated check date, plus what GYSM does and does not do. Facts may have changed since the check date, so confirm on the source pages. Read-only.",
    inputSchema: {
      type: "object",
      properties: { rival: { type: "string", description: "Optional: only this rival (lovable, bolt, v0, base44 or replit)." } },
      additionalProperties: false,
    },
    annotations: { title: "Compare AI app builders", ...READ_ONLY },
    run: (args) => {
      const want = typeof args.rival === "string" ? args.rival.toLowerCase().trim() : "";
      const rivals = want ? RIVALS.filter((r) => r.slug === want || r.name.toLowerCase() === want) : RIVALS;
      if (want && rivals.length === 0) return fail(`Unknown rival "${cleanText(want, 40)}". Try: ${RIVALS.map((r) => r.slug).join(", ")}.`);
      const lines = [
        `Facts below were read from each product's own pages on ${CHECKED_ON}. They may have changed since; check the sources.`,
        "",
        "GYSM:",
        `- Output: ${GYSM_FACTS.output}`,
        `- Backend: ${GYSM_FACTS.backend}`,
        `- Hosting: ${GYSM_FACTS.hosting}`,
        `- Limits: ${GYSM_FACTS.limits.join(" ")}`,
        "",
        ...rivals.flatMap((r) => [`${r.name}:`, `- Pricing: ${r.pricing}`, `- Allowance: ${r.allowance}`, ...(r.listed.length ? [`- Listed: ${r.listed.join("; ")}`] : []), `- Source: ${r.sources.map((s) => s.url).join(", ")}`, ""]),
        `Full comparison: ${SITE_URL}/best-ai-app-builder`,
      ];
      return ok(lines.join("\n"), { checkedOn: CHECKED_ON, gysm: GYSM_FACTS, rivals: rivals.map((r) => ({ slug: r.slug, name: r.name, pricing: r.pricing, allowance: r.allowance, listed: r.listed, sources: r.sources })) });
    },
  },
  {
    name: "get_build_link",
    title: "Get a link that opens the builder",
    description: "Return a link that opens the GYSM builder with a prompt already filled in. The user signs in and presses build themselves. Creates nothing and spends nothing.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string", description: "The build prompt to pre-fill (max 1800 characters).", maxLength: 1800 } },
      required: ["prompt"],
      additionalProperties: false,
    },
    annotations: { title: "Get a link that opens the builder", ...READ_ONLY },
    run: (args) => {
      const prompt = cleanText(args.prompt, 1800);
      if (!prompt) return fail("Please provide the prompt to pre-fill.");
      const url = buildDeepLink(prompt, { source: "mcp", medium: "get_build_link" });
      return ok(`Open this link to continue in the GYSM builder: ${url}`, { url });
    },
  },
  {
    name: "build_app",
    title: "Build the app in your GYSM account",
    description:
      "Generate the app now in the caller's own GYSM account and return its live link. Requires the caller's GYSM API key (created at gysm.io/settings/api-keys) sent as an Authorization bearer header. This creates a project in that account and uses that account's plan credits, so only call it when the user has asked to build now. Without a key it creates nothing and returns a link to continue in the builder.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to build (max 1800 characters). Use the build prompt from plan_app or plan_online_store.", maxLength: 1800 },
        tier: { type: "string", enum: ["fast", "best"], description: "Model tier. 'best' uses more of the plan's allowance. Defaults to fast." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    annotations: { title: "Build the app in your GYSM account", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: async (args, ctx) => {
      const prompt = cleanText(args.prompt, 1800);
      if (!prompt) return fail("Please provide the prompt to build.");
      if (!ctx.apiKey) {
        const url = buildDeepLink(prompt, { source: "mcp", medium: "build_app_nokey" });
        return ok(`Nothing was built: no GYSM API key was provided with this connection. To build, open this link, sign in and press build: ${url}\n(To build straight from chat, create an API key at ${SITE_URL}/settings/api-keys and add it to this connector as a bearer token.)`, { built: false, url });
      }
      const f = ctx.fetchImpl ?? fetch;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 280_000);
      try {
        // Always our own origin: the caller's key is never sent anywhere else.
        const res = await f(`${SITE_URL}/api/v1/generate`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${ctx.apiKey}` },
          body: JSON.stringify({ prompt, tier: args.tier === "best" ? "best" : "fast" }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as Json;
        if (res.status === 401) return fail("GYSM did not accept that API key. Create a new one at " + SITE_URL + "/settings/api-keys.");
        if (res.status === 402) return fail("Nothing was built: this account has no usage left right now. Check the plan at " + SITE_URL + "/pricing.");
        if (!res.ok) return fail(`The build did not complete (status ${res.status}). ${typeof data.error === "string" ? cleanText(data.error, 300) : "Please try again."}`);
        const url = typeof data.url === "string" ? data.url : null;
        return ok(`Built. Live link: ${url ?? "(saved to your GYSM dashboard)"}`, { built: true, projectId: data.projectId ?? null, url });
      } catch (err) {
        return fail(err instanceof Error && err.name === "AbortError" ? "The build took too long and was stopped. Open your GYSM dashboard to see whether it finished." : "Could not reach GYSM to build. Please try again.");
      } finally {
        clearTimeout(timer);
      }
    },
  },
];

// GYSM Stores for shoppers: only offered while STORES_ENABLED=true. They load
// the store modules lazily so this file stays importable (and testable)
// without a database.
const STORE_TOOLS: Tool[] = [
  {
    name: "find_stores",
    title: "Find shops built on GYSM",
    description:
      "Search the online shops and businesses built on GYSM (products, appointments, services). Returns each live store's name, description and address. Read-only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "What the shopper wants, e.g. 'candles', 'haircut in Rome' (max 80 characters). Empty lists recent stores.", maxLength: 80 } },
      additionalProperties: false,
    },
    annotations: { title: "Find shops built on GYSM", ...READ_ONLY, openWorldHint: true },
    run: async (args) => {
      const { findStores } = await import("@/lib/stores/mcp");
      const stores = await findStores(args.query);
      if (!stores.length) return ok("No live GYSM stores match that yet.", { stores: [] });
      return ok(stores.map((s) => `${s.name} (store: ${s.slug}) ${s.url}${s.description ? `\n  ${s.description}` : ""}`).join("\n"), { stores });
    },
  },
  {
    name: "get_store",
    title: "See a GYSM shop's products and services",
    description:
      "Read one GYSM store's catalogue: products with prices and stock, bookable services, shipping options and whether it is taking orders. Read-only.",
    inputSchema: {
      type: "object",
      properties: { store: { type: "string", description: "The store's slug from find_stores.", maxLength: 40 } },
      required: ["store"],
      additionalProperties: false,
    },
    annotations: { title: "See a GYSM shop's products and services", ...READ_ONLY, openWorldHint: true },
    run: async (args) => {
      const { storeCatalog } = await import("@/lib/stores/mcp");
      const c = await storeCatalog(args.store);
      if (!c) return fail("That store doesn't exist or isn't open.");
      const lines = [
        `${c.name}: ${c.url}${c.takingOrders ? "" : " (not taking orders right now)"}`,
        ...(c.description ? [c.description] : []),
        ...(c.products.length ? ["", "Products:", ...c.products.map((p) => `- ${p.name}: ${p.price}${p.inStock ? "" : " (sold out)"} [product ${p.id}]`)] : []),
        ...(c.services.length ? ["", "Appointments (booked on the store page):", ...c.services.map((v) => `- ${v.name}: ${v.durationMinutes} min, ${v.price}`)] : []),
        ...(c.shippingOptions.length ? ["", `Shipping: ${c.shippingOptions.map((r) => `${r.name} ${r.price}`).join(", ")}`] : []),
      ];
      return ok(lines.join("\n"), c);
    },
  },
  {
    name: "start_checkout",
    title: "Start checkout at a GYSM shop",
    description:
      "Create a secure Stripe checkout link for products from one GYSM store. Only call it after the shopper has confirmed the items and quantities. The shopper opens the link and pays on Stripe's page; nothing is charged by this tool. Prices come from the store, not from the request.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string", description: "The store's slug.", maxLength: 40 },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: { type: "object", properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 99 } }, required: ["productId", "quantity"], additionalProperties: false },
        },
      },
      required: ["store", "items"],
      additionalProperties: false,
    },
    annotations: { title: "Start checkout at a GYSM shop", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (args) => {
      const { startStoreCheckout } = await import("@/lib/stores/mcp");
      const { formatMoney } = await import("@/lib/stores/core");
      const r = await startStoreCheckout(args.store, args.items);
      if ("error" in r) return fail(r.error);
      return ok(`Checkout is ready. Subtotal ${formatMoney(r.totalCents, r.currency)} before shipping and tax. Open this link to pay securely on Stripe: ${r.url}`, { url: r.url, subtotalCents: r.totalCents, currency: r.currency });
    },
  },
];

// -- account tools: act for the GYSM user whose API key the caller sent -------

const NEED_KEY =
  `This needs the user's own GYSM API key. They create one at ${SITE_URL}/settings/api-keys and add it to this connector as "Authorization: Bearer gysm_live_...". Nothing was changed.`;

async function withUser(ctx: McpContext): Promise<{ user: import("@/lib/mcp/account").KeyUser; mod: typeof import("@/lib/mcp/account") } | ToolResult> {
  if (!ctx.apiKey) return fail(NEED_KEY);
  const mod = await import("@/lib/mcp/account");
  const user = await mod.userForKey(ctx.apiKey);
  if (!user) return fail(`GYSM did not accept that API key. Create a new one at ${SITE_URL}/settings/api-keys.`);
  return { user, mod };
}

const PUBLIC_ACCOUNT_TOOLS: Tool[] = [
  {
    name: "get_gysm_plans",
    title: "See GYSM plans and prices",
    description: "List the plans GYSM sells today with price, billing interval and what's included. Read-only; buying happens with subscribe_to_gysm, which returns a Stripe link the person pays on.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "See GYSM plans and prices", ...READ_ONLY },
    run: async () => {
      const { visiblePlans } = await import("@/lib/mcp/account");
      const plans = visiblePlans();
      return ok(plans.map((p) => `${p.name} (${p.id}): ${p.price} ${p.currency}${p.interval === "month" ? " a month" : " once"}. ${p.description}${p.tagline ? ` ${p.tagline}.` : ""}`).join("\n") + `\nDetails: ${SITE_URL}/pricing`, { plans });
    },
  },
];

const KEYED_ACCOUNT_TOOLS: Tool[] = [
  {
    name: "subscribe_to_gysm",
    title: "Get a link to subscribe to GYSM",
    description:
      "Create a Stripe checkout link for a GYSM plan for the user who owns the connected API key. Only call it after the user has chosen to buy. The user opens the link and pays on Stripe's page; this tool charges nothing and never handles card details.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan id from get_gysm_plans (default plan_monthly).", maxLength: 40 } },
      additionalProperties: false,
    },
    annotations: { title: "Get a link to subscribe to GYSM", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (args, ctx) => {
      const w = await withUser(ctx);
      if ("content" in w) return w;
      const plan = typeof args.plan === "string" && args.plan.trim() ? args.plan.trim() : "plan_monthly";
      const r = await w.mod.planCheckout(w.user, plan);
      if ("error" in r) return fail(r.error);
      return ok(`Open this link to pay securely on Stripe: ${r.url}\nThe plan starts as soon as the payment goes through.`, { url: r.url, plan });
    },
  },
  {
    name: "my_gysm_account",
    title: "Check my GYSM plan and usage",
    description: "Show the connected user's GYSM plan and how much usage is left. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Check my GYSM plan and usage", ...READ_ONLY },
    run: async (_args, ctx) => {
      const w = await withUser(ctx);
      if ("content" in w) return w;
      const u = await w.mod.usageFor(w.user);
      return ok(`${u.title}: ${u.value}${u.cta ? ` (${SITE_URL}${u.cta.href})` : ""}`, u);
    },
  },
];

// Store management for the key's owner: the same tools the GYSM builder agent
// uses (lib/agentCore.ts STORE_TOOL_DEFS), minus anything that takes a secret,
// spends money or deletes (store_connect, store_buy_label, store_mark_shipped,
// store_remove_*, store_cancel_booking): those stay in the GYSM builder,
// where the user approves each one.
const MCP_STORE_MANAGE = new Set([
  "store_setup_guide", "store_status", "store_create", "store_add_product", "store_update_product", "store_add_service",
  "store_update_service", "store_set_hours", "store_set_shipping", "store_update", "store_payments_link", "store_orders", "store_bookings",
]);
const MCP_STORE_READ_ONLY = new Set(["store_setup_guide", "store_status", "store_orders", "store_bookings"]);

const STORE_MANAGE_TOOLS: Tool[] = (STORE_TOOL_DEFS as any[])
  .filter((d) => MCP_STORE_MANAGE.has(d.function.name))
  .map((d) => {
    const name: string = d.function.name;
    const title = name.replace(/^store_/, "Store: ").replace(/_/g, " ");
    return {
      name,
      title,
      description: `${d.function.description} Acts in the GYSM account of the connected API key.`,
      inputSchema: d.function.parameters as Json,
      annotations: MCP_STORE_READ_ONLY.has(name)
        ? { title, ...READ_ONLY }
        : { title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run: async (args: Json, ctx: McpContext) => {
        const w = await withUser(ctx);
        if ("content" in w) return w;
        const r = await w.mod.runStoreTool(w.user, name, args);
        return r.ok ? ok(r.output) : fail(r.output);
      },
    } satisfies Tool;
  });

function storesOn(): boolean {
  return process.env.STORES_ENABLED === "true";
}

const STORE_INSTRUCTIONS =
  " Shoppers can also buy from stores built on GYSM: find_stores and get_store to browse, then start_checkout (only after the shopper confirms the items) returns a Stripe link the shopper opens to pay. Never pay or enter card details for them. With the user's own GYSM API key you can also create and run their online store (store_create, store_add_product, store_add_service, store_set_hours, store_payments_link, store_update with status live): they connect Stripe themselves through the link.";

const INSTRUCTIONS =
  "get_gysm_plans lists GYSM's plans; with the user's own GYSM API key, subscribe_to_gysm returns a Stripe link the user pays on (never pay for them) and my_gysm_account shows their usage. GYSM turns a plain-English description into a working single-page web app with a live preview. Use plan_app or plan_online_store first to shape the idea (free, instant, no sign-in). Use get_build_link to hand the user a link, or build_app only when the user asks to build now and has connected their own GYSM API key. GYSM builds one self-contained page per build with no managed database or sign-in: be upfront about that, and never promise results the plan does not state.";

function rpcError(id: RpcResponse["id"], code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleOne(msg: RpcRequest, ctx: McpContext): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return isNotification ? null : rpcError(id, -32600, "Invalid request");
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Json;

  if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...

  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "gysm", title: "GYSM App and Store Builder", version: SERVER_VERSION },
          instructions: INSTRUCTIONS + (storesOn() ? STORE_INSTRUCTIONS : ""),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        // build_app is only listed when the caller sent their own GYSM key. A
        // keyless connection (for example a directory listing) sees only the
        // free planning tools, all of which work without sign-in. A direct
        // tools/call to build_app without a key still returns the sign-in link.
        result: {
          tools: [
            ...TOOLS.filter((t) => t.name !== "build_app" || Boolean(ctx.apiKey)),
            ...PUBLIC_ACCOUNT_TOOLS,
            ...(ctx.apiKey ? KEYED_ACCOUNT_TOOLS : []),
            ...(storesOn() ? STORE_TOOLS : []),
            ...(storesOn() && ctx.apiKey ? STORE_MANAGE_TOOLS : []),
          ].map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
          })),
        },
      };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool =
        TOOLS.find((t) => t.name === name) ??
        PUBLIC_ACCOUNT_TOOLS.find((t) => t.name === name) ??
        KEYED_ACCOUNT_TOOLS.find((t) => t.name === name) ??
        (storesOn() ? [...STORE_TOOLS, ...STORE_MANAGE_TOOLS].find((t) => t.name === name) : undefined);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${cleanText(name, 60)}`);
      const args = (params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {}) as Json;
      try {
        return { jsonrpc: "2.0", id, result: await tool.run(args, ctx) };
      } catch (err) {
        console.error("[mcp] tool failed:", name, err instanceof Error ? err.message : err);
        return { jsonrpc: "2.0", id, result: fail("Something went wrong running that tool. Please try again.") };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${cleanText(msg.method, 60)}`);
  }
}

/** Handle one parsed POST body (a single message or a batch). */
export async function handleMcpBody(body: unknown, ctx: McpContext = {}): Promise<{ status: number; body?: unknown }> {
  if (Array.isArray(body)) {
    if (body.length === 0) return { status: 400, body: rpcError(null, -32600, "Empty batch") };
    if (body.length > 20) return { status: 400, body: rpcError(null, -32600, "Batch too large") };
    const out = (await Promise.all(body.map((m) => handleOne((m ?? {}) as RpcRequest, ctx)))).filter((r): r is RpcResponse => r !== null);
    return out.length ? { status: 200, body: out } : { status: 202 };
  }
  if (!body || typeof body !== "object") return { status: 400, body: rpcError(null, -32600, "Invalid request") };
  const res = await handleOne(body as RpcRequest, ctx);
  return res ? { status: 200, body: res } : { status: 202 };
}

export const MCP_TOOL_NAMES = TOOLS.map((t) => t.name);
export const MCP_STORE_TOOL_NAMES = STORE_TOOLS.map((t) => t.name);
export const MCP_ACCOUNT_TOOL_NAMES = { public: PUBLIC_ACCOUNT_TOOLS.map((t) => t.name), keyed: KEYED_ACCOUNT_TOOLS.map((t) => t.name) };
export const MCP_STORE_MANAGE_TOOL_NAMES = STORE_MANAGE_TOOLS.map((t) => t.name);
export { LANDING_USE_CASES };
