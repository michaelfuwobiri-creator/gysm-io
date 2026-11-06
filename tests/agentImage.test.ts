import { describe, expect, it } from "vitest";
import { checkImageArgs } from "@/lib/agentImage";

describe("checkImageArgs", () => {
  it("accepts a prompt and a .webp path and defaults to landscape", () => {
    expect(checkImageArgs({ prompt: " A warm bakery counter ", path: "site/images/hero.webp" })).toEqual({ ok: true, prompt: "A warm bakery counter", path: "site/images/hero.webp", shape: "landscape" });
    expect(checkImageArgs({ prompt: "x", path: "a.webp", shape: "portrait" })).toMatchObject({ ok: true, shape: "portrait" });
  });
  it("rejects missing prompt, bad paths and wrong extensions", () => {
    expect(checkImageArgs({ path: "a.webp" }).ok).toBe(false);
    expect(checkImageArgs({ prompt: "x", path: "../a.webp" }).ok).toBe(false);
    expect(checkImageArgs({ prompt: "x", path: "a.png" }).ok).toBe(false);
    expect(checkImageArgs({ prompt: "x".repeat(2000), path: "a.webp" }).ok).toBe(false);
  });
});
