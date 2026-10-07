import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { buildMultiFile } from "../lib/ai/multiFile";

const index = (extra = "") =>
  `<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"><script src="app.js"></script></head><body>${extra}</body></html>`;
const reply = (text: string, finish = "stop") => ({ choices: [{ message: { content: text }, finish_reason: finish }] });

beforeEach(() => {
  create.mockReset();
  process.env.OPENAI_API_KEY = "test";
});

describe("buildMultiFile", () => {
  it("builds a new project from file blocks", async () => {
    create.mockResolvedValueOnce(
      reply(`=== FILE: index.html ===\n${index()}\n=== FILE: styles.css ===\nbody{}\n=== FILE: app.js ===\nlet a;\n`)
    );
    const r = await buildMultiFile({ instruction: "a site", existing: null, tier: "fast" });
    expect(r.ok).toBe(true);
    expect((r as any).files.map((f: any) => f.path).sort()).toEqual(["app.js", "index.html", "styles.css"]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("makes one repair call for a missing linked file", async () => {
    create
      .mockResolvedValueOnce(reply(`=== FILE: index.html ===\n${index()}\n=== FILE: styles.css ===\nbody{}\n`))
      .mockResolvedValueOnce(reply(`=== FILE: app.js ===\nlet a;\n`));
    const r = await buildMultiFile({ instruction: "a site", existing: null, tier: "fast" });
    expect(r.ok).toBe(true);
    expect((r as any).files.some((f: any) => f.path === "app.js")).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps the result when the repair call fails", async () => {
    create.mockResolvedValueOnce(reply(`=== FILE: index.html ===\n${index()}\n`)).mockRejectedValueOnce(new Error("boom"));
    const r = await buildMultiFile({ instruction: "a site", existing: null, tier: "fast" });
    expect(r.ok).toBe(true);
  });

  it("edits: merges changed files and applies deletions", async () => {
    const existing = [
      { path: "index.html", content: index() },
      { path: "styles.css", content: "a" },
      { path: "app.js", content: "x" },
    ];
    create.mockResolvedValueOnce(reply(`=== FILE: styles.css ===\nb\n`));
    const r = await buildMultiFile({ instruction: "recolour", existing, tier: "fast" });
    expect(r.ok).toBe(true);
    const files = (r as any).files;
    expect(files.find((f: any) => f.path === "styles.css").content).toBe("b");
    expect(files.find((f: any) => f.path === "app.js").content).toBe("x");
  });

  it("fails cleanly on truncated output, no markers, or an incomplete index", async () => {
    create.mockResolvedValueOnce(reply("=== FILE: index.html ===\n<!DOCTYPE html><html>", "length"));
    expect((await buildMultiFile({ instruction: "x", existing: null, tier: "fast" })).ok).toBe(false);
    create.mockResolvedValueOnce(reply("<!DOCTYPE html><html></html>"));
    expect((await buildMultiFile({ instruction: "x", existing: null, tier: "fast" })).ok).toBe(false);
    create.mockResolvedValueOnce(reply("=== FILE: index.html ===\n<!DOCTYPE html><html><body>"));
    expect((await buildMultiFile({ instruction: "x", existing: null, tier: "fast" })).ok).toBe(false);
  });

  it("rejects unsafe paths from the model", async () => {
    create.mockResolvedValueOnce(reply(`=== FILE: index.html ===\n${index()}\n=== FILE: ../evil.js ===\nx\n`));
    expect((await buildMultiFile({ instruction: "x", existing: null, tier: "fast" })).ok).toBe(false);
  });
});
