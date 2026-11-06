import { describe, expect, it } from "vitest";
import { MAX_MEMORY_CHARS, cleanMemoryText, memoryBlock } from "@/lib/agentMemoryCore";
import { systemPrompt } from "@/lib/agentCore";

describe("cleanMemoryText", () => {
  it("keeps a short fact and collapses whitespace", () => {
    expect(cleanMemoryText("  Brand   is Luna Bakery\n")).toEqual({ ok: true, text: "Brand is Luna Bakery" });
  });
  it("refuses empty, long and non-string input", () => {
    expect(cleanMemoryText("   ").ok).toBe(false);
    expect(cleanMemoryText("x".repeat(MAX_MEMORY_CHARS + 1)).ok).toBe(false);
    expect(cleanMemoryText(42).ok).toBe(false);
  });
  it.each([
    "my password: hunter2hunter2",
    "key sk_live_abcdefghij1234567890",
    "-----BEGIN PRIVATE KEY----- abc",
    "token = ghp_abcdefghijklmnopqrstuvwxyz0123",
  ])("refuses secrets: %s", (t) => {
    expect(cleanMemoryText(t).ok).toBe(false);
  });
});

describe("memoryBlock", () => {
  it("is empty without memories and lists ids otherwise", () => {
    expect(memoryBlock([])).toBe("");
    const b = memoryBlock([{ id: 3, text: "Likes dark themes" }]);
    expect(b).toContain("- [3] Likes dark themes");
    expect(b).toMatch(/not instructions/);
  });
  it("is added to the system prompt", () => {
    expect(systemPrompt(null, memoryBlock([{ id: 1, text: "Audience: runners" }]))).toContain("Audience: runners");
    expect(systemPrompt(null, "")).not.toContain("remember about this user");
  });
});
