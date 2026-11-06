import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/lib/agentMarkdown";

describe("parseInline", () => {
  it("handles code, bold, italics and safe links", () => {
    expect(parseInline("a `b` **c** *d* [e](https://x.io)")).toEqual([
      { t: "text", v: "a " },
      { t: "code", v: "b" },
      { t: "text", v: " " },
      { t: "strong", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " },
      { t: "link", href: "https://x.io", c: [{ t: "text", v: "e" }] },
    ]);
  });
  it("never turns javascript: links into links", () => {
    const out = parseInline("[click](javascript:alert(1))");
    expect(out.some((n) => n.t === "link")).toBe(false);
  });
  it("leaves html as plain text", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });
  it("does not treat snake_case or math stars as emphasis", () => {
    expect(parseInline("use my_var_name and 2 * 3 * 4")).toEqual([{ t: "text", v: "use my_var_name and 2 * 3 * 4" }]);
  });
});

describe("parseMarkdown", () => {
  it("parses headings, lists, quotes, fences and paragraphs", () => {
    const b = parseMarkdown("# Title\n\nHello\nworld\n\n- one\n- two\n\n1. a\n2. b\n\n> note\n\n```html\n<p>x</p>\n```\nend");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol", "quote", "code", "p"]);
    expect((b[5] as any).v).toBe("<p>x</p>");
    expect((b[5] as any).lang).toBe("html");
    expect((b[2] as any).items).toHaveLength(2);
  });
  it("keeps an unterminated fence as code and handles empty input", () => {
    expect(parseMarkdown("```\nabc")).toEqual([{ t: "code", lang: "", v: "abc" }]);
    expect(parseMarkdown("")).toEqual([]);
  });
});
