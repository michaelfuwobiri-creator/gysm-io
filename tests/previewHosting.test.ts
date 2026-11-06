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
    const big = "x".repeat(600_000);
    const r = selectHostableFiles([{ path: "index.html", text: "ok" }, { path: "big.js", text: big }]);
    expect(r.skipped).toEqual(["big.js"]);
  });
});
