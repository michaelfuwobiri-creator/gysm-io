import { describe, expect, it, vi } from "vitest";
import { MCP_ACCOUNT_TOOL_NAMES, MCP_TOOL_NAMES, handleMcpBody } from "@/lib/mcp/server";

const call = (method: string, params?: unknown, id: number | null = 1, ctx = {}) => handleMcpBody({ jsonrpc: "2.0", id, method, params }, ctx);

describe("MCP server", () => {
  it("initializes and echoes a supported protocol version", async () => {
    const r: any = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(r.status).toBe(200);
    expect(r.body.result.protocolVersion).toBe("2025-03-26");
    expect(r.body.result.capabilities.tools).toBeDefined();
  });
  it("falls back to the newest protocol for an unknown version", async () => {
    const r: any = await call("initialize", { protocolVersion: "1999-01-01" });
    expect(r.body.result.protocolVersion).toBe("2025-06-18");
  });
  it("accepts notifications with 202 and no body", async () => {
    const r = await handleMcpBody({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(r.status).toBe(202);
    expect(r.body).toBeUndefined();
  });
  it("hides build_app from a keyless tools/list but still answers it with a sign-in link", async () => {
    const r: any = await call("tools/list");
    const names = r.body.result.tools.map((t: any) => t.name);
    expect(names).toEqual([...MCP_TOOL_NAMES.filter((n: string) => n !== "build_app"), ...MCP_ACCOUNT_TOOL_NAMES.public]);
    const c: any = await call("tools/call", { name: "build_app", arguments: { prompt: "a candle shop" } });
    expect(c.body.result.isError).toBeFalsy();
    expect(c.body.result.content[0].text).toContain("Nothing was built");
  });
  it("lists tools with explicit annotation booleans (account tools too when a key is sent)", async () => {
    const r: any = await call("tools/list", undefined, 1, { apiKey: "gysm_live_abc" });
    const tools = r.body.result.tools;
    expect(tools.map((t: any) => t.name)).toEqual([...MCP_TOOL_NAMES, ...MCP_ACCOUNT_TOOL_NAMES.public, ...MCP_ACCOUNT_TOOL_NAMES.keyed]);
    for (const t of tools) {
      for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) expect(typeof t.annotations[k]).toBe("boolean");
      expect(t.inputSchema.type).toBe("object");
    }
    expect(tools.find((t: any) => t.name === "build_app").annotations.readOnlyHint).toBe(false);
    expect(tools.find((t: any) => t.name === "plan_app").annotations.readOnlyHint).toBe(true);
  });
  it("plan_app returns a plan and a link", async () => {
    const r: any = await call("tools/call", { name: "plan_app", arguments: { idea: "An online store for handmade candles" } });
    expect(r.body.result.isError).toBeFalsy();
    expect(r.body.result.content[0].text).toContain("gysm.io");
  });
  it("plan_app rejects an empty idea as a tool error", async () => {
    const r: any = await call("tools/call", { name: "plan_app", arguments: {} });
    expect(r.body.result.isError).toBe(true);
  });
  it("build_app without a key builds nothing and never calls the network", async () => {
    const fetchImpl = vi.fn();
    const r: any = await call("tools/call", { name: "build_app", arguments: { prompt: "a candle shop" } }, 1, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.body.result.content[0].text).toContain("Nothing was built");
  });
  it("build_app with a key only talks to the GYSM origin and passes the caller's own key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ projectId: "p1", shareUrl: "https://www.gysm.io/publish/p1" }), { status: 200 }));
    await call("tools/call", { name: "build_app", arguments: { prompt: "a candle shop" } }, 1, { apiKey: "gysm_live_abc", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/generate$/);
    expect(new URL(url).hostname).toMatch(/gysm\.io$/);
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gysm_live_abc");
  });
  it("build_app maps 401 and 402 to clear errors", async () => {
    for (const status of [401, 402]) {
      const fetchImpl = vi.fn(async () => new Response("{}", { status }));
      const r: any = await call("tools/call", { name: "build_app", arguments: { prompt: "x app idea" } }, 1, { apiKey: "gysm_live_abc", fetchImpl });
      expect(r.body.result.isError).toBe(true);
    }
  });
  it("unknown tool and unknown method return JSON-RPC errors", async () => {
    const a: any = await call("tools/call", { name: "nope", arguments: {} });
    expect(a.body.error.code).toBe(-32602);
    const b: any = await call("does/not/exist");
    expect(b.body.error.code).toBe(-32601);
  });
  it("handles batches and rejects oversize or empty ones", async () => {
    const ok: any = await handleMcpBody([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }]);
    expect(ok.body).toHaveLength(2);
    expect((await handleMcpBody([])).status).toBe(400);
    expect((await handleMcpBody(Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" })))).status).toBe(400);
  });
});

import { MCP_STORE_TOOL_NAMES } from "@/lib/mcp/server";

describe("MCP store tools", () => {
  it("are listed only while stores are enabled", async () => {
    const names = async () => ((await call("tools/list")) as any).body.result.tools.map((t: any) => t.name);
    expect((await names()).some((n: string) => MCP_STORE_TOOL_NAMES.includes(n))).toBe(false);
    process.env.STORES_ENABLED = "true";
    try {
      expect(await names()).toEqual(expect.arrayContaining(["find_stores", "get_store", "start_checkout"]));
      const init: any = await call("initialize", { protocolVersion: "2025-06-18" });
      expect(init.body.result.instructions).toContain("start_checkout");
    } finally {
      delete process.env.STORES_ENABLED;
    }
  });
  it("refuses store tools while stores are off", async () => {
    const r: any = await call("tools/call", { name: "find_stores", arguments: {} });
    expect(r.body.error.message).toContain("Unknown tool");
  });
  it("marks start_checkout as a non-read-only tool", async () => {
    process.env.STORES_ENABLED = "true";
    try {
      const r: any = await call("tools/list");
      const t = r.body.result.tools.find((x: any) => x.name === "start_checkout");
      expect(t.annotations.readOnlyHint).toBe(false);
      expect(t.annotations.destructiveHint).toBe(false);
    } finally {
      delete process.env.STORES_ENABLED;
    }
  });
});

import { MCP_STORE_MANAGE_TOOL_NAMES } from "@/lib/mcp/server";

describe("MCP account and store-management tools", () => {
  it("keyed tools explain how to connect a key instead of acting without one", async () => {
    for (const name of ["subscribe_to_gysm", "my_gysm_account"]) {
      const r: any = await call("tools/call", { name, arguments: {} });
      expect(r.body.result.isError).toBe(true);
      expect(r.body.result.content[0].text).toContain("settings/api-keys");
    }
  });
  it("offers store management only with a key and stores on, never secret, money or delete tools", async () => {
    expect(MCP_STORE_MANAGE_TOOL_NAMES).toEqual(expect.arrayContaining(["store_create", "store_add_product", "store_payments_link", "store_update"]));
    for (const banned of ["store_connect", "store_buy_label", "store_mark_shipped", "store_remove_product", "store_remove_service", "store_cancel_booking"]) {
      expect(MCP_STORE_MANAGE_TOOL_NAMES).not.toContain(banned);
    }
    process.env.STORES_ENABLED = "true";
    try {
      const keyless: any = await call("tools/list");
      expect(keyless.body.result.tools.map((t: any) => t.name)).not.toContain("store_create");
      const keyed: any = await call("tools/list", undefined, 1, { apiKey: "gysm_live_abc" });
      const names = keyed.body.result.tools.map((t: any) => t.name);
      expect(names).toContain("store_create");
      const status = keyed.body.result.tools.find((t: any) => t.name === "store_status");
      expect(status.annotations.readOnlyHint).toBe(true);
      const keylessCall: any = await call("tools/call", { name: "store_create", arguments: { name: "Mia" } });
      expect(keylessCall.body.result.content[0].text).toContain("settings/api-keys");
    } finally {
      delete process.env.STORES_ENABLED;
    }
  });
});
