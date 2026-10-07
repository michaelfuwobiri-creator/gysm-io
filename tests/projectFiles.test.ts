import { describe, it, expect } from "vitest";
import {
  normalizePath,
  validateFileSet,
  parseFileBlocks,
  serializeFileBlocks,
  findMissingLinks,
  contentTypeFor,
  MAX_FILES,
} from "../lib/projectFilesCore";
import { withPreviewShim, PREVIEW_STORAGE_SHIM } from "../lib/userContent";

describe("normalizePath", () => {
  it("accepts ordinary paths", () => {
    expect(normalizePath("index.html")).toBe("index.html");
    expect(normalizePath("./styles.css")).toBe("styles.css");
    expect(normalizePath("pages/about.html")).toBe("pages/about.html");
  });
  it("rejects traversal, absolute, hidden, odd and unknown-extension paths", () => {
    for (const bad of ["../x.html", "a/../b.html", "/etc/x.html", "a\\b.html", ".env.js", "a/.hidden.js", "a b.html", "x.exe", "noext", "a//b.html", "", "x\0.html"]) {
      expect(normalizePath(bad), bad).toBeNull();
    }
  });
});

describe("validateFileSet", () => {
  const ok = [{ path: "index.html", content: "<html></html>" }, { path: "app.js", content: "1" }];
  it("accepts a valid set", () => {
    expect(validateFileSet(ok).ok).toBe(true);
  });
  it("needs index.html", () => {
    const r = validateFileSet([{ path: "app.js", content: "1" }]);
    expect(r.ok).toBe(false);
  });
  it("rejects duplicates ignoring case", () => {
    const r = validateFileSet([...ok, { path: "APP.js", content: "2" }]);
    expect(r.ok).toBe(false);
  });
  it("enforces file count, per-file and total caps", () => {
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({ path: i === 0 ? "index.html" : `f${i}.js`, content: "x" }));
    expect(validateFileSet(many).ok).toBe(false);
    expect(validateFileSet([{ path: "index.html", content: "x".repeat(500_001) }]).ok).toBe(false);
    const big = Array.from({ length: 5 }, (_, i) => ({ path: i === 0 ? "index.html" : `f${i}.js`, content: "x".repeat(450_000) }));
    expect(validateFileSet(big).ok).toBe(false);
  });
});

describe("file blocks", () => {
  it("returns null when there are no markers", () => {
    expect(parseFileBlocks("<!DOCTYPE html><html></html>")).toBeNull();
  });
  it("parses multiple files and strips code fences", () => {
    const text = "=== FILE: index.html ===\n<html></html>\n=== FILE: styles.css ===\n```css\nbody{color:red}\n```\n";
    const files = parseFileBlocks(text)!;
    expect(files).toEqual([
      { path: "index.html", content: "<html></html>" },
      { path: "styles.css", content: "body{color:red}" },
    ]);
  });
  it("round-trips", () => {
    const files = [{ path: "index.html", content: "<a>" }, { path: "x/y.js", content: "var a=1;\nvar b=2;" }];
    expect(parseFileBlocks(serializeFileBlocks(files))).toEqual(files);
  });
});

describe("findMissingLinks", () => {
  it("flags relative links to missing text files, resolves ../, ignores external and images", () => {
    const files = [
      { path: "index.html", content: '<link href="styles.css"><script src="app.js"></script><a href="pages/about.html">x</a><img src="a.png"><a href="https://x.com/y.html">' },
      { path: "pages/about.html", content: '<a href="../index.html">home</a><a href="missing.html">m</a>' },
      { path: "styles.css", content: "" },
    ];
    expect(findMissingLinks(files).sort()).toEqual(["app.js", "pages/missing.html"].sort());
  });
});

describe("contentTypeFor", () => {
  it("maps extensions", () => {
    expect(contentTypeFor("a.css")).toContain("text/css");
    expect(contentTypeFor("a.js")).toContain("javascript");
  });
});

describe("withPreviewShim", () => {
  it("injects the shim right after <head>", () => {
    const out = withPreviewShim("<!DOCTYPE html><html><head><title>t</title></head><body></body></html>");
    expect(out.indexOf(PREVIEW_STORAGE_SHIM)).toBe(out.indexOf("<head>") + "<head>".length);
  });
  it("prepends when there is no head", () => {
    expect(withPreviewShim("<p>x</p>").startsWith(PREVIEW_STORAGE_SHIM)).toBe(true);
  });
});

import { parseBlocks, applyFileEdit } from "../lib/projectFilesCore";

describe("edit blocks", () => {
  it("parses changed files and deletions together", () => {
    const text = "=== FILE: styles.css ===\nbody{}\n=== DELETE: old.js ===\n=== FILE: new.js ===\nlet a;\n";
    expect(parseBlocks(text)).toEqual({
      files: [{ path: "styles.css", content: "body{}" }, { path: "new.js", content: "let a;" }],
      deleted: ["old.js"],
    });
  });
  it("applies an edit: replace, add, delete; never deletes index.html", () => {
    const existing = [
      { path: "index.html", content: "<a>" },
      { path: "old.js", content: "1" },
      { path: "styles.css", content: "a" },
    ];
    const r = applyFileEdit(existing, [{ path: "styles.css", content: "b" }, { path: "new.js", content: "2" }], ["old.js", "index.html"]);
    expect(r.ok).toBe(true);
    const files = (r as { ok: true; files: { path: string; content: string }[] }).files;
    expect(files.map((f) => f.path).sort()).toEqual(["index.html", "new.js", "styles.css"]);
    expect(files.find((f) => f.path === "styles.css")!.content).toBe("b");
  });
  it("rejects an edit that introduces a bad path", () => {
    expect(applyFileEdit([{ path: "index.html", content: "x" }], [{ path: "../evil.js", content: "x" }], []).ok).toBe(false);
  });
});

import { runProjectPreflight } from "../lib/projectPreflight";

describe("runProjectPreflight", () => {
  const html = '<!DOCTYPE html><html><head><link rel="stylesheet" href="styles.css"></head><body><h1>Hi</h1></body></html>';
  it("passes a clean two-file project", () => {
    const r = runProjectPreflight([{ path: "index.html", content: html }, { path: "styles.css", content: "body{}" }]);
    expect(r.issues.filter((i) => i.type === "exposed_secret" || i.type === "missing_file")).toEqual([]);
  });
  it("flags a missing linked file and a secret in a non-HTML file", () => {
    const r = runProjectPreflight([
      { path: "index.html", content: html.replace("styles.css", "gone.css") },
      { path: "app.js", content: 'const k = "sk_live_' + "a1B2c3D4e5F6g7H8i9J0k1L2" + '";' },
    ]);
    const types = r.issues.map((i) => i.type);
    expect(types).toContain("missing_file");
    expect(types).toContain("exposed_secret");
    expect(r.issues.find((i) => i.type === "exposed_secret")!.message).toContain("app.js");
  });
});
