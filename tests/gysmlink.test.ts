import { describe, it, expect } from "vitest";
import { normalizeHandle, safeUrl, cleanText, isBot, deviceOf, referrerHost, summarize, isTheme, pageUrl } from "@/lib/gysmlinkCore";

describe("gysmlink core", () => {
  it("normalizes handles and blocks reserved ones", () => {
    expect(normalizeHandle("  @Mike_Dev ")).toBe("mike_dev");
    expect(normalizeHandle("a")).toBeNull();
    expect(normalizeHandle("bad handle")).toBeNull();
    expect(normalizeHandle("-lead")).toBeNull();
    expect(normalizeHandle("go")).toBeNull();
    expect(normalizeHandle("API")).toBeNull();
    expect(normalizeHandle("x".repeat(31))).toBeNull();
    expect(normalizeHandle(42)).toBeNull();
  });

  it("accepts only safe destination URLs", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("example.com/page")).toBe("https://example.com/page");
    expect(safeUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(safeUrl("tel:+15551234567")).toBe("tel:+15551234567");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
    expect(safeUrl("https://user:pw@example.com")).toBeNull();
    expect(safeUrl("https://exa mple.com")).toBeNull();
    expect(safeUrl("https://nodots")).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(safeUrl("https://a.com/" + "x".repeat(2100))).toBeNull();
  });

  it("cleans text", () => {
    expect(cleanText("  hi\u0000   there\n", 20)).toBe("hi there");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText(5, 3)).toBe("");
  });

  it("classifies traffic", () => {
    expect(isBot("Googlebot/2.1")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari")).toBe(false);
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile")).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0) Safari")).toBe("tablet");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0) Chrome")).toBe("desktop");
    expect(referrerHost("https://www.instagram.com/p/abc?x=1")).toBe("instagram.com");
    expect(referrerHost("")).toBe("direct");
    expect(referrerHost("not a url")).toBe("direct");
  });

  it("summarizes views, clicks and CTR", () => {
    const s = summarize(
      [
        { kind: "view", link_id: null, referrer: "instagram.com", device: "mobile" },
        { kind: "view", link_id: null, referrer: "instagram.com", device: "mobile" },
        { kind: "view", link_id: null, referrer: "direct", device: "desktop" },
        { kind: "view", link_id: null, referrer: "x.com", device: "desktop" },
        { kind: "click", link_id: "a", referrer: "", device: "mobile" },
        { kind: "click", link_id: "a", referrer: "", device: "mobile" },
        { kind: "click", link_id: "gone", referrer: "", device: "mobile" },
      ],
      ["a", "b"]
    );
    expect(s.views).toBe(4);
    expect(s.clicks).toBe(3);
    expect(s.ctr).toBe(0.75);
    expect(s.perLink).toEqual([
      { id: "a", clicks: 2, ctr: 0.5 },
      { id: "b", clicks: 0, ctr: 0 },
    ]);
    expect(s.referrers[0]).toEqual({ name: "instagram.com", count: 2 });
    expect(s.devices[0]).toEqual({ name: "desktop", count: 2 });
    expect(summarize([], []).ctr).toBe(0);
  });

  it("validates themes and builds page URLs", () => {
    expect(isTheme("neon")).toBe(true);
    expect(isTheme("hax")).toBe(false);
    expect(pageUrl("https://gysm.io/", "mike")).toBe("https://gysm.io/l/mike");
  });
});
