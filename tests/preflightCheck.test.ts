import { describe, expect, it } from "vitest";
import { runPreflightCheck } from "../lib/preflightCheck";

const page = (body: string) => `<!DOCTYPE html><html><head><title>t</title></head><body>${body}</body></html>`;

describe("runPreflightCheck", () => {
  it("passes a clean page", () => {
    const r = runPreflightCheck(page(`<div id="top"><a href="#top">Top</a><img src="a.png" alt="A"></div>`));
    expect(r.status).toBe("pass");
    expect(r.issues).toEqual([]);
  });

  it("detects truncated output", () => {
    const r = runPreflightCheck(`<!DOCTYPE html><html><body><div>cut off`);
    expect(r.issues.some((i) => i.type === "truncated")).toBe(true);
    expect(r.status).toBe("warnings");
  });

  it("detects unbalanced divs", () => {
    const r = runPreflightCheck(page(`<div><div>x</div>`));
    expect(r.issues.some((i) => i.type === "unbalanced_tags")).toBe(true);
  });

  it("detects dead anchors and empty hrefs", () => {
    const r = runPreflightCheck(page(`<a href="#missing">x</a><a href="#">y</a>`));
    expect(r.issues.filter((i) => i.type === "broken_anchor")).toHaveLength(2);
  });

  it("detects placeholder text and missing alt", () => {
    const r = runPreflightCheck(page(`<p>Lorem ipsum dolor</p><img src="a.png">`));
    const types = r.issues.map((i) => i.type);
    expect(types).toContain("placeholder_text");
    expect(types).toContain("missing_alt");
  });

  it("reports an exposed secret without echoing the key", () => {
    const key = `sk_live_${"4eC39HqLyjWDarjt".repeat(2)}`;
    const r = runPreflightCheck(page(`<script>const k="${key}";</script>`));
    const issue = r.issues.find((i) => i.type === "exposed_secret");
    expect(issue).toBeDefined();
    expect(JSON.stringify(r)).not.toContain(key);
  });
});
