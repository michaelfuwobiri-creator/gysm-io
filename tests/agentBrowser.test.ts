import { describe, expect, it } from "vitest";
import { agentToolsFor, checkBrowserCall, cleanBrowserUrl, describeCall, isBrowserTool, isBrowserWriteTool, systemPrompt } from "@/lib/agentCore";

describe("browser tools", () => {
  it("are offered only to the extension", () => {
    const names = (b: boolean) => agentToolsFor(false, b).map((t: any) => t.function.name);
    expect(names(false).some((n) => n.startsWith("browser_"))).toBe(false);
    expect(names(true)).toEqual(expect.arrayContaining(["browser_read", "browser_click", "browser_type", "browser_navigate", "browser_tabs", "browser_scroll"]));
  });
  it("marks click, type and navigate as needing approval, reads as free", () => {
    for (const n of ["browser_click", "browser_type", "browser_navigate"]) expect(isBrowserWriteTool(n)).toBe(true);
    for (const n of ["browser_read", "browser_tabs", "browser_scroll"]) expect(isBrowserWriteTool(n)).toBe(false);
    expect(isBrowserTool("browser_read")).toBe(true);
    expect(isBrowserTool("write_file")).toBe(false);
  });
  it("accepts only normal web addresses", () => {
    expect(cleanBrowserUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "chrome://settings", "data:text/html,hi", "https://user:pw@example.com", "not a url", 42]) {
      expect(cleanBrowserUrl(bad as any)).toBeNull();
    }
  });
  it("validates call arguments", () => {
    expect(checkBrowserCall("browser_click", { id: 12 })).toBeNull();
    expect(checkBrowserCall("browser_click", { id: "x" })).toMatch(/id must/);
    expect(checkBrowserCall("browser_type", { id: 3, text: "hi" })).toBeNull();
    expect(checkBrowserCall("browser_type", { id: 3 })).toMatch(/text/);
    expect(checkBrowserCall("browser_type", { id: 3, text: "x".repeat(3000) })).toMatch(/too long/);
    expect(checkBrowserCall("browser_navigate", { url: "javascript:1" })).toMatch(/url/);
    expect(checkBrowserCall("browser_scroll", { direction: "sideways" })).toMatch(/direction/);
    expect(checkBrowserCall("browser_read", {})).toBeNull();
  });
  it("adds the safety rules to the prompt only in the extension", () => {
    expect(systemPrompt(null, "", false)).not.toMatch(/Chrome extension/);
    const p = systemPrompt(null, "", true);
    expect(p).toMatch(/untrusted/);
    expect(p).toMatch(/Never enter passwords/);
  });
  it("describes calls for the approval card", () => {
    expect(describeCall("browser_click", { id: 7 })).toBe("Click element 7 on the page");
    expect(describeCall("browser_navigate", { url: "https://x.io" })).toContain("https://x.io");
  });
});
