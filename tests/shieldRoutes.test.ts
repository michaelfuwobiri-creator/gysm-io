import { describe, it, expect, vi, beforeEach } from "vitest";

const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ sql: (...a: any[]) => sqlMock(...a) }));
const getUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getUser: () => getUserMock() }));

import { hashToken, generateToken } from "@/lib/shield";

const AGENT = {
  id: "11111111-1111-4111-8111-111111111111", user_id: "u1", name: "Exporter", platform: "zapier", description: "",
  permissions: ["crm:read"], status: "active", token_prefix: "shd_abcdef", rate_limit_per_min: 60, bulk_limit: 100,
  payment_limit_cents: "0", auto_quarantine: true, alert_email: null, created_at: "", last_seen_at: null,
};
const post = (body: any, token = "shd_" + "a".repeat(48), url = "http://x/api/shield/ingest") =>
  new Request(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }) as any;

describe("tokens", () => {
  it("generates prefixed tokens and stores only a hash", () => {
    const t = generateToken();
    expect(t.raw.startsWith("shd_")).toBe(true);
    expect(t.hash).toBe(hashToken(t.raw));
    expect(t.hash).not.toContain(t.raw);
    expect(t.prefix.length).toBe(10);
  });
});

describe("POST /api/shield/ingest", () => {
  beforeEach(() => sqlMock.mockReset());

  it("rejects missing, bad and unknown tokens", async () => {
    const { POST } = await import("@/app/api/shield/ingest/route");
    expect((await POST(new Request("http://x", { method: "POST", body: "{}" }) as any)).status).toBe(401);
    sqlMock.mockResolvedValueOnce([]);
    expect((await POST(post({ scope: "crm:read" }))).status).toBe(401);
    expect((await POST(post({ nope: 1 }))).status).toBe(400);
  });

  it("allows an in-scope action and records the event", async () => {
    const { POST } = await import("@/app/api/shield/ingest/route");
    sqlMock
      .mockResolvedValueOnce([AGENT]) // find by token
      .mockResolvedValueOnce([{ n: 0 }]) // recent count
      .mockResolvedValueOnce([]) // insert event
      .mockResolvedValueOnce([]); // update last_seen
    const res = await POST(post({ scope: "crm:read", records: 5 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ allowed: true, reasons: [], agent_status: "active" });
  });

  it("blocks a bulk export, raises a critical alert and auto-quarantines", async () => {
    const { POST } = await import("@/app/api/shield/ingest/route");
    sqlMock
      .mockResolvedValueOnce([AGENT])
      .mockResolvedValueOnce([{ n: 0 }])
      .mockResolvedValueOnce([]) // event
      .mockResolvedValueOnce([]) // last_seen
      .mockResolvedValueOnce([]) // dup check -> none
      .mockResolvedValueOnce([]) // insert alert
      .mockResolvedValueOnce([{ n: 1 }]) // serious count
      .mockResolvedValueOnce([]) // quarantine update
      .mockResolvedValueOnce([]); // auto_quarantine alert
    const res = await POST(post({ scope: "crm:read", records: 5000 }, undefined, "http://x/api/shield/ingest?strict=1"));
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.allowed).toBe(false);
    expect(json.reasons).toContain("bulk_limit_exceeded");
    expect(json.agent_status).toBe("quarantined");
    expect(json.alerts.map((a: any) => a.kind)).toEqual(["bulk_access", "auto_quarantine"]);
  });

  it("fails closed when the database is down", async () => {
    const { POST } = await import("@/app/api/shield/ingest/route");
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(post({ scope: "crm:read" }));
    expect(res.status).toBe(503);
    expect((await res.json()).allowed).toBe(false);
  });
});

describe("agent management", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    getUserMock.mockReset();
  });

  it("requires sign-in and validates permissions on create", async () => {
    const { POST } = await import("@/app/api/shield/agents/route");
    getUserMock.mockResolvedValue(null);
    expect((await POST(post({ name: "x" }))).status).toBe(401);
    getUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    expect((await POST(post({ name: "x", permissions: ["bad scope"] }))).status).toBe(400);
    expect((await POST(post({ name: "  ", permissions: [] }))).status).toBe(400);
  });

  it("returns the token once and only stores its hash", async () => {
    const { POST } = await import("@/app/api/shield/agents/route");
    getUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" });
    sqlMock
      .mockResolvedValueOnce([{ x: 1 }]).mockResolvedValueOnce([{ x: 1 }]).mockResolvedValueOnce([{ x: 1 }]) // ready checks
      .mockResolvedValueOnce([{ n: 0 }]) // agent count
      .mockResolvedValueOnce([{ id: "a1", name: "Bot", platform: "zapier", token_prefix: "shd_abc" }]);
    const res = await POST(post({ name: "Bot", platform: "zapier", permissions: ["crm:read"] }));
    const json = await res.json();
    expect(json.token.startsWith("shd_")).toBe(true);
    const insertArgs = sqlMock.mock.calls[4].slice(1);
    expect(insertArgs).toContain(hashToken(json.token));
    expect(insertArgs).not.toContain(json.token);
  });
});
