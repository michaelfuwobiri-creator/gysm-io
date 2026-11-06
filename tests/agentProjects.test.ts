import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
import { agentProjectMarker, buildProjectHtml, MAX_PROJECT_HTML_BYTES } from "@/lib/agentProjects";

describe("buildProjectHtml", () => {
  it("uses the site's own index.html when it fits", () => {
    const html = "<!doctype html><html><body>hi</body></html>";
    expect(buildProjectHtml(html, "my-site", "https://x.vercel.app")).toBe(html);
  });
  it("falls back to a link page when there is no index.html or it is too big", () => {
    const a = buildProjectHtml(null, "my-site", "https://x.vercel.app");
    expect(a).toContain("Open the live site");
    expect(a).toContain('href="https://x.vercel.app"');
    const big = buildProjectHtml("x".repeat(MAX_PROJECT_HTML_BYTES + 1), "my-site", "https://x.vercel.app");
    expect(big).toContain("Open the live site");
  });
  it("escapes the project name and url", () => {
    const out = buildProjectHtml(null, '<script>alert(1)</script>', 'https://x.com/"><b>');
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).not.toContain('"><b>');
  });
});

describe("agentProjectMarker", () => {
  it("is stable per project so redeploys update the same row", () => {
    expect(agentProjectMarker("bakery")).toBe("[Agent] bakery");
  });
});

import { sql } from "@/lib/db";
import { saveAgentProject } from "@/lib/agentProjects";

describe("saveAgentProject", () => {
  it("updates the existing row on redeploy instead of inserting a new one", async () => {
    const q = sql as unknown as ReturnType<typeof vi.fn>;
    q.mockReset();
    q.mockResolvedValueOnce([{ id: "p1" }]).mockResolvedValueOnce([]);
    const id = await saveAgentProject({ userId: "u", project: "site", url: "https://s.vercel.app", indexHtml: "<html></html>" });
    expect(id).toBe("p1");
    expect(q).toHaveBeenCalledTimes(2); // select + update
  });
  it("inserts a new project the first time", async () => {
    const q = sql as unknown as ReturnType<typeof vi.fn>;
    q.mockReset();
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "new1" }]);
    expect(await saveAgentProject({ userId: "u", project: "site", url: "https://s.vercel.app", indexHtml: null })).toBe("new1");
  });
  it("never throws when the database fails", async () => {
    const q = sql as unknown as ReturnType<typeof vi.fn>;
    q.mockReset();
    q.mockRejectedValue(new Error("db down"));
    expect(await saveAgentProject({ userId: "u", project: "site", url: "u", indexHtml: null })).toBeNull();
  });
});
