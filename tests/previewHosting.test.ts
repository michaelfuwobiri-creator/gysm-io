import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
import { selectHostableFiles } from "@/lib/agentProjects";

describe("selectHostableFiles", () => {
  it("keeps hostable text files and reports the rest", () => {
    const r = selectHostableFiles([
      { path: "index.html", text: "<h1>Hi</h1>" },
      { path: "styles.css", text: "a{}" },
      { path: "app.js", text: "1" },
      { path: "img/logo.png" },
      { path: "fonts/a.woff2" },
      { path: ".hidden.css", text: "x" },
    ]);
    expect(r.error).toBeUndefined();
    expect(r.files.map((f) => f.path)).toEqual(["index.html", "styles.css", "app.js"]);
    expect(r.skipped).toEqual(["img/logo.png", "fonts/a.woff2", ".hidden.css"]);
  });

  it("uses the first page as index.html when there is none", () => {
    const r = selectHostableFiles([{ path: "home.html", text: "<p>home</p>" }, { path: "pages/about.html", text: "x" }]);
    expect(r.files[0]).toEqual({ path: "index.html", content: "<p>home</p>" });
  });

  it("explains when there is no page, and respects size caps", () => {
    expect(selectHostableFiles([{ path: "app.js", text: "1" }]).error).toMatch(/no web page/i);
    const big = "x".repeat(2_100_000);
    const r = selectHostableFiles([{ path: "index.html", text: "ok" }, { path: "big.js", text: big }]);
    expect(r.skipped).toEqual(["big.js"]);
  });
});

describe("hosted images and fonts", () => {
  it("keeps images and fonts as base64 and skips unknown types", async () => {
    const { selectHostableFiles: pick } = await import("@/lib/agentProjects");
    const r = pick([
      { path: "index.html", text: "<img src=logo.png>" },
      { path: "logo.png", base64: Buffer.from("png").toString("base64") },
      { path: "fonts/a.woff2", base64: "AAAA" },
      { path: "logo.png.txt" },
      { path: "data.bin", base64: "AAAA" },
      { path: "my photo.jpg", base64: "AAAA" },
    ]);
    expect(r.files.map((f) => f.path)).toEqual(["index.html", "logo.png", "fonts/a.woff2"]);
    expect(r.files[1].content).toBe(Buffer.from("png").toString("base64"));
    expect(r.skipped).toEqual(["logo.png.txt", "data.bin", "my photo.jpg"]);
  });

  it("enforces the per-file cap on decoded size", async () => {
    const { selectHostableFiles: pick } = await import("@/lib/agentProjects");
    const big = Buffer.alloc(2_100_000).toString("base64");
    const r = pick([{ path: "index.html", text: "x" }, { path: "hero.jpg", base64: big }]);
    expect(r.skipped).toEqual(["hero.jpg"]);
  });
});
