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


import { thumbnailBundle } from "@/lib/agentProjects";

describe("thumbnailBundle", () => {
  it("bakes stylesheets, scripts and images into index.html so a card looks like the site", () => {
    const html = thumbnailBundle([
      { path: "index.html", content: '<html><head><link rel="stylesheet" href="style.css"></head><body><img src="logo.png"><script src="app.js"></script></body></html>' },
      { path: "style.css", content: "body{background:#fee}" },
      { path: "app.js", content: "window.x=1" },
      { path: "logo.png", content: "aGk=" },
    ]);
    expect(html).toContain("<style>body{background:#fee}</style>");
    expect(html).toContain("window.x=1");
    expect(html).toContain("data:image/png;base64,aGk=");
    expect(html).not.toContain("gysmPreviewNav");
    expect(html).not.toContain('href="style.css"');
  });
  it("falls back to the bare index.html when there is nothing to bundle", () => {
    expect(thumbnailBundle([{ path: "index.html", content: "<p>hi</p>" }])).toContain("<p>hi</p>");
  });
});

import { looksUnbundled } from "@/lib/agentProjects";

describe("looksUnbundled", () => {
  it("spots pages that still point at their own css or js", () => {
    expect(looksUnbundled('<link rel="stylesheet" href="style.css">')).toBe(true);
    expect(looksUnbundled('<script src="js/app.js"></script>')).toBe(true);
  });
  it("ignores bundled pages, external files and non-strings", () => {
    expect(looksUnbundled("<style>a{}</style><script>1</script>")).toBe(false);
    expect(looksUnbundled('<link rel="stylesheet" href="https://fonts.googleapis.com/x.css"><script src="//cdn.x/y.js"></script>')).toBe(false);
    expect(looksUnbundled(null)).toBe(false);
  });
});

import { bundleAgentThumbnails } from "@/lib/agentProjects";

describe("bundleAgentThumbnails", () => {
  const page = '<html><head><link rel="stylesheet" href="style.css"></head><body>hi</body></html>';
  it("builds a styled copy for the card and never writes to the database", async () => {
    const q = sql as unknown as ReturnType<typeof vi.fn>;
    q.mockReset();
    q.mockResolvedValueOnce([{ project_id: "p1", path: "style.css", content: "body{color:red}" }]);
    const out = await bundleAgentThumbnails([
      { id: "p1", prompt: "[Agent] site", html: page },
      { id: "p2", prompt: "A normal build", html: page },
      { id: "p3", prompt: "[Agent] done", html: "<style>a{}</style>" },
    ]);
    expect(Object.keys(out)).toEqual(["p1"]);
    expect(out.p1).toContain("<style>body{color:red}</style>");
    expect(q).toHaveBeenCalledTimes(1); // one read, no update
    expect(String(q.mock.calls[0][0].join(" "))).not.toMatch(/update|insert|delete/i);
  });
  it("skips the query when nothing needs repair and survives a database error", async () => {
    const q = sql as unknown as ReturnType<typeof vi.fn>;
    q.mockReset();
    expect(await bundleAgentThumbnails([{ id: "p3", prompt: "[Agent] done", html: "<style>a{}</style>" }])).toEqual({});
    expect(q).not.toHaveBeenCalled();
    q.mockRejectedValueOnce(new Error("db down"));
    expect(await bundleAgentThumbnails([{ id: "p1", prompt: "[Agent] site", html: page }])).toEqual({});
  });
});
