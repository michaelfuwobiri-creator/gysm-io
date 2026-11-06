import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/agentTools", () => ({ quote: (s: string) => `'${s}'`, workspaceRoot: vi.fn() }));
vi.mock("@/lib/shell/sandbox", () => ({ getUserSandbox: vi.fn(), runInSandbox: vi.fn() }));
const redirect = vi.fn((to: string) => {
  throw new Error(`REDIRECT ${to}`);
});
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
import BuilderPage from "@/app/builder/page";
import { folderNameFor, importIntoWorkspace } from "@/lib/agentImport";

const go = (sp: any) => {
  try {
    BuilderPage({ searchParams: sp });
  } catch (e: any) {
    return String(e.message).replace("REDIRECT ", "");
  }
  return "";
};

describe("/builder now opens the Agent", () => {
  it("carries the old links' context across", () => {
    expect(go({})).toBe("/agent");
    expect(go({ classic: "1" })).toBe("/agent");
    expect(go({ projectId: "abc" })).toBe("/agent?project=abc");
    expect(go({ template: "t1" })).toBe("/agent?template=t1");
    expect(go({ prompt: "a dating site" })).toBe("/agent?prompt=a%20dating%20site");
    expect(go({ remixSkill: "image", remixPrompt: "cats" })).toBe("/agent?prompt=cats");
  });
});

describe("opening a build in the Agent", () => {
  it("makes safe folder names", () => {
    expect(folderNameFor("[Agent] heartline", "site")).toBe("heartline");
    expect(folderNameFor("My Café Booking App!", "site")).toBe("my-cafe-booking-app");
    expect(folderNameFor("", "template")).toBe("template");
    expect(folderNameFor(null, "site")).toBe("site");
  });
  it("rejects bad ids and builds the user doesn't own", async () => {
    expect((await importIntoWorkspace("u1", { projectId: "nope" })).ok).toBe(false);
    const { sql } = await import("@/lib/db");
    (sql as any).mockResolvedValueOnce([{ id: "11111111-1111-1111-1111-111111111111", user_id: "someone-else", name: "x", is_template: false }]);
    const r = await importIntoWorkspace("u1", { projectId: "11111111-1111-1111-1111-111111111111" });
    expect(r).toEqual({ ok: false, status: 404, error: "Build not found." });
    (sql as any).mockResolvedValueOnce([{ id: "11111111-1111-1111-1111-111111111111", user_id: "u1", name: "x", is_template: false }]);
    const t = await importIntoWorkspace("u1", { templateId: "11111111-1111-1111-1111-111111111111" });
    expect(t).toEqual({ ok: false, status: 404, error: "Template not found." });
  });
});
