import { describe, expect, it } from "vitest";
import { MAX_PULL_BYTES, validatePulledHtml } from "../lib/githubPull";

const page = "<!DOCTYPE html><html><head></head><body><p>hi</p></body></html>";

describe("validatePulledHtml", () => {
  it("accepts a complete page, ignoring surrounding whitespace and doctype case", () => {
    expect(validatePulledHtml(`\n  ${page}\n`).ok).toBe(true);
    expect(validatePulledHtml(page.replace("DOCTYPE", "doctype")).ok).toBe(true);
  });

  it("rejects empty content", () => {
    expect(validatePulledHtml("   ").ok).toBe(false);
  });

  it("rejects a file that is not a full HTML document", () => {
    const r = validatePulledHtml("# README\n\nNot a page");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("DOCTYPE");
  });

  it("rejects a page that was cut off", () => {
    const r = validatePulledHtml("<!DOCTYPE html><html><body><div>half");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("</html>");
  });

  it("rejects files over the size limit", () => {
    const big = `<!DOCTYPE html><html><body>${"a".repeat(MAX_PULL_BYTES)}</body></html>`;
    const r = validatePulledHtml(big);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("2 MB");
  });
});
