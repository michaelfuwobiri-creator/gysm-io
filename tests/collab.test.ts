import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanCommentBody, cleanDisplayName, activeViewers, initialsOf, PRESENCE_TTL_MS, MAX_COMMENT_CHARS } from "@/lib/collabCore";

describe("collab core", () => {
  it("cleans comment bodies", () => {
    expect(cleanCommentBody("  hi\u0000 there  ")).toBe("hi there");
    expect(cleanCommentBody("   ")).toBeNull();
    expect(cleanCommentBody(42)).toBeNull();
    expect(cleanCommentBody("a".repeat(MAX_COMMENT_CHARS + 50))!.length).toBe(MAX_COMMENT_CHARS);
    expect(cleanCommentBody("line1\nline2")).toBe("line1\nline2");
  });

  it("cleans display names", () => {
    expect(cleanDisplayName("")).toBe("Teammate");
    expect(cleanDisplayName(null)).toBe("Teammate");
    expect(cleanDisplayName("Ada\nLovelace")).toBe("Ada Lovelace");
  });

  it("lists only fresh viewers, deduped, caller first, without ids", () => {
    const now = 1_000_000_000_000;
    const iso = (ms: number) => new Date(now - ms).toISOString();
    const v = activeViewers(
      [
        { user_id: "u1", display_name: "Ben", last_seen: iso(5_000) },
        { user_id: "u2", display_name: "Me", last_seen: iso(10_000) },
        { user_id: "u3", display_name: "Stale", last_seen: iso(PRESENCE_TTL_MS + 1_000) },
        { user_id: "u1", display_name: "Ben dup", last_seen: iso(30_000) },
        { user_id: "u4", display_name: "Bad", last_seen: "not a date" },
      ],
      "u2",
      now
    );
    expect(v).toEqual([
      { name: "Me", you: true },
      { name: "Ben", you: false },
    ]);
    expect(JSON.stringify(v)).not.toContain("u1");
  });

  it("makes initials", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("ben")).toBe("B");
    expect(initialsOf("  ")).toBe("?");
  });
});

// ---- routes -----------------------------------------------------------------
const sqlMock = vi.fn();
vi.mock("@/lib/db", () => ({ sql: (...a: any[]) => sqlMock(...a) }));
const getUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getUser: () => getUserMock() }));

const ID = "11111111-1111-4111-8111-111111111111";
const ROOT = "22222222-2222-4222-8222-222222222222";
const req = (body?: any, url = "http://x/api") =>
  new Request(url, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined }) as any;

describe("collab routes", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    getUserMock.mockReset();
  });

  it("requires sign-in", async () => {
    getUserMock.mockResolvedValue(null);
    const { GET } = await import("@/app/api/projects/[id]/collab/comments/route");
    const res = await GET(req(), { params: { id: ID } });
    expect(res.status).toBe(401);
  });

  it("404s when the caller cannot open the build", async () => {
    getUserMock.mockResolvedValue({ id: "u1", name: "Ann", orgId: null });
    sqlMock.mockResolvedValueOnce([]); // resolveBuildRoot
    const { POST } = await import("@/app/api/projects/[id]/collab/comments/route");
    const res = await POST(req({ body: "hello" }), { params: { id: ID } });
    expect(res.status).toBe(404);
  });

  it("reports not-ready (GET) and 409 (POST) when the migration is missing", async () => {
    getUserMock.mockResolvedValue({ id: "u1", name: "Ann", orgId: null });
    const { GET, POST } = await import("@/app/api/projects/[id]/collab/comments/route");
    sqlMock.mockResolvedValueOnce([{ root: ROOT }]).mockRejectedValueOnce(new Error("relation does not exist"));
    const g = await GET(req(), { params: { id: ID } });
    expect(await g.json()).toMatchObject({ ready: false, comments: [] });
    sqlMock.mockResolvedValueOnce([{ root: ROOT }]).mockRejectedValueOnce(new Error("relation does not exist"));
    const p = await POST(req({ body: "hi" }), { params: { id: ID } });
    expect(p.status).toBe(409);
  });

  it("posts a comment against the ROOT id and marks it mine", async () => {
    getUserMock.mockResolvedValue({ id: "u1", name: "Ann", orgId: null });
    const { POST } = await import("@/app/api/projects/[id]/collab/comments/route");
    sqlMock
      .mockResolvedValueOnce([{ root: ROOT }]) // resolve
      .mockResolvedValueOnce([{ x: 1 }]) // build_comments exists
      .mockResolvedValueOnce([{ x: 1 }]) // build_presence exists
      .mockResolvedValueOnce([{ n: 0 }]) // rate check
      .mockResolvedValueOnce([{ id: "c1", author_name: "Ann", body: "hello", created_at: "2026-10-07T00:00:00Z" }]);
    const res = await POST(req({ body: "  hello " }), { params: { id: ID } });
    const json = await res.json();
    expect(json.comment).toMatchObject({ id: "c1", body: "hello", mine: true });
    const insertCall = sqlMock.mock.calls[4];
    expect(insertCall.slice(1)).toContain(ROOT);
  });

  it("rate limits rapid posting", async () => {
    getUserMock.mockResolvedValue({ id: "u1", name: "Ann", orgId: null });
    const { POST } = await import("@/app/api/projects/[id]/collab/comments/route");
    sqlMock
      .mockResolvedValueOnce([{ root: ROOT }])
      .mockResolvedValueOnce([{ x: 1 }])
      .mockResolvedValueOnce([{ x: 1 }])
      .mockResolvedValueOnce([{ n: 20 }]);
    const res = await POST(req({ body: "spam" }), { params: { id: ID } });
    expect(res.status).toBe(429);
  });

  it("presence returns viewers without user ids", async () => {
    getUserMock.mockResolvedValue({ id: "u1", name: "Ann", orgId: "org_1" });
    const { POST } = await import("@/app/api/projects/[id]/collab/presence/route");
    sqlMock
      .mockResolvedValueOnce([{ root: ROOT }])
      .mockResolvedValueOnce([{ x: 1 }])
      .mockResolvedValueOnce([{ x: 1 }])
      .mockResolvedValueOnce([]) // upsert
      .mockResolvedValueOnce([
        { user_id: "u1", display_name: "Ann", last_seen: new Date().toISOString() },
        { user_id: "u9", display_name: "Bo", last_seen: new Date().toISOString() },
      ]);
    const res = await POST(req({}), { params: { id: ID } });
    const json = await res.json();
    expect(json.viewers).toEqual([
      { name: "Ann", you: true },
      { name: "Bo", you: false },
    ]);
    expect(JSON.stringify(json)).not.toContain("u9");
  });
});
