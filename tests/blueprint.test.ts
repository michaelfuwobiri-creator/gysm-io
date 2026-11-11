import { describe, expect, it } from "vitest";
import { GENERIC, LANDING_USE_CASES, USE_CASES, buildDeepLink, cleanText, inferUseCase, makeBlueprint, makeStoreBlueprint } from "@/lib/blueprint";

describe("inferUseCase", () => {
  it("matches an online store idea", () => {
    expect(inferUseCase("An online store selling handmade candles with a cart").slug).toBe("online-store");
  });
  it("matches a restaurant idea", () => {
    expect(inferUseCase("website for my restaurant with a menu and reservations").slug).toBe("restaurant");
  });
  it("falls back to the generic plan instead of guessing", () => {
    expect(inferUseCase("zzz qqq xxx").slug).toBe(GENERIC.slug);
  });
  it("does not match keywords inside other words", () => {
    expect(inferUseCase("a scarecrow tracker").slug).toBe(GENERIC.slug);
  });
});

describe("makeBlueprint", () => {
  it("returns a plan with honest limits and a deep link", () => {
    const bp = makeBlueprint("An online store selling handmade candles", { source: "test", medium: "unit" });
    expect(bp.useCase.matched).toBe(true);
    expect(bp.sections.length).toBeGreaterThan(2);
    expect(bp.limits.join(" ").length).toBeGreaterThan(20);
    expect(bp.buildLink).toContain("/agent?prompt=");
    expect(bp.buildLink).toContain("utm_source=test");
  });
  it("caps and cleans the idea", () => {
    expect(cleanText("x".repeat(5000)).length).toBeLessThanOrEqual(600);
    expect(cleanText(undefined)).toBe("");
  });
});

describe("makeStoreBlueprint", () => {
  it("builds a store plan with the chosen payment route", () => {
    const bp = makeStoreBlueprint({ niche: "handmade candles", products: ["Soy candle"], currency: "EUR", payments: "thirdweb" }, { source: "test" });
    expect(JSON.stringify(bp).toLowerCase()).toContain("candles");
    expect(JSON.stringify(bp).toLowerCase()).toContain("thirdweb");
  });
});

describe("use case data", () => {
  it("every landing page has a path, an example and no empty sections", () => {
    for (const u of LANDING_USE_CASES) {
      expect(u.path).toBe(`/build/${u.slug}`);
      expect(u.examplePrompt.length).toBeGreaterThan(20);
      expect(u.sections.length).toBeGreaterThan(2);
    }
  });
  it("slugs are unique", () => {
    const slugs = USE_CASES.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it("never claims what GYSM cannot do", () => {
    const text = JSON.stringify(USE_CASES).toLowerCase();
    expect(text).not.toContain("guaranteed");
    expect(text).not.toContain("thousands of users");
  });
});

describe("buildDeepLink", () => {
  it("encodes the prompt and drops unsafe utm characters", () => {
    const url = buildDeepLink("hello world & more", { source: "A B<script>" });
    const q = new URL(url).searchParams;
    expect(q.get("prompt")).toBe("hello world & more");
    expect(url).not.toContain("<");
    expect(q.get("utm_source")).not.toMatch(/[<>]/);
  });
});
