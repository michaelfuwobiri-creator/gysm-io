import { describe, it, expect } from "vitest";
import { DOMParser as LinkedomParser } from "linkedom";
import { applyVisualEdit, isSafePath, isHexColor, withVisualEditBridge, VISUAL_EDIT_BRIDGE, type VisualEdit } from "../lib/visualEdit";

const parse = (html: string) => new LinkedomParser().parseFromString(html, "text/html") as unknown as Document;
const page = `<!DOCTYPE html>
<html><head><title>T</title></head>
<body>
<div class="a"><h1>Hello &amp; welcome</h1><p>Same</p></div>
<div class="b"><h1>Second</h1><p>Same</p><span>Hi <b>there</b></span></div>
</body></html>`;

const h1First: VisualEdit = { path: "body > div:nth-of-type(1) > h1:nth-of-type(1)", tag: "h1", expect: "Hello & welcome" };

describe("applyVisualEdit text", () => {
  it("changes only the targeted element's text and keeps everything else byte for byte", () => {
    const r = applyVisualEdit(page, { ...h1First, setText: "Bonjour <b>" }, parse);
    expect(r.ok).toBe(true);
    const html = (r as { ok: true; html: string }).html;
    expect(html).toContain("<h1>Bonjour &lt;b&gt;</h1>");
    expect(html.replace("Bonjour &lt;b&gt;", "Hello &amp; welcome")).toBe(page);
  });
  it("picks the right one of two identical elements", () => {
    const second: VisualEdit = { path: "body > div:nth-of-type(2) > p:nth-of-type(1)", tag: "p", expect: "Same", setText: "Changed" };
    const r = applyVisualEdit(page, second, parse) as { ok: true; html: string };
    expect(r.html).toContain('<div class="a"><h1>Hello &amp; welcome</h1><p>Same</p></div>');
    expect(r.html).toContain("<p>Changed</p>");
  });
  it("refuses an element with child elements, and a stale expectation", () => {
    const span: VisualEdit = { path: "body > div:nth-of-type(2) > span:nth-of-type(1)", tag: "span", expect: "Hi there", setText: "x" };
    expect(applyVisualEdit(page, span, parse).ok).toBe(false);
    expect(applyVisualEdit(page, { ...h1First, expect: "Different", setText: "x" }, parse).ok).toBe(false);
    expect(applyVisualEdit(page, { ...h1First, tag: "h2", setText: "x" }, parse).ok).toBe(false);
  });
  it("refuses unsafe input", () => {
    expect(applyVisualEdit(page, { ...h1First, path: "body > script; x", setText: "x" }, parse).ok).toBe(false);
    expect(applyVisualEdit(page, { ...h1First, color: "red" }, parse).ok).toBe(false);
    expect(applyVisualEdit(page, { ...h1First, setText: "x".repeat(2001) }, parse).ok).toBe(false);
  });
});

describe("applyVisualEdit colours", () => {
  it("adds a managed style block and updates/removes rules without duplicating", () => {
    const a = applyVisualEdit(page, { ...h1First, color: "#ff0000" }, parse) as { ok: true; html: string };
    expect(a.html).toContain('<style id="gysm-visual-edits">body > div:nth-of-type(1) > h1:nth-of-type(1){color:#ff0000 !important}</style>');
    const b = applyVisualEdit(a.html, { ...h1First, background: "#00ff00" }, parse) as { ok: true; html: string };
    expect(b.html.match(/gysm-visual-edits/g)!.length).toBe(1);
    expect(b.html).toContain("color:#ff0000 !important;background-color:#00ff00 !important");
    const c = applyVisualEdit(b.html, { ...h1First, color: null, background: null }, parse) as { ok: true; html: string };
    expect(c.html).not.toContain("gysm-visual-edits");
    expect(c.html).toBe(page);
  });
});

describe("helpers", () => {
  it("validates paths and colours", () => {
    expect(isSafePath("body")).toBe(true);
    expect(isSafePath("body > div:nth-of-type(2)")).toBe(true);
    expect(isSafePath("body > div")).toBe(false);
    expect(isSafePath("html > body")).toBe(false);
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
  });
  it("injects the bridge after <head>", () => {
    const out = withVisualEditBridge("<html><head><title>x</title></head></html>");
    expect(out.indexOf(VISUAL_EDIT_BRIDGE)).toBe("<html><head>".length);
  });
});
