import { describe, expect, it } from "vitest";
import {
  BUILD_COST_USD,
  BUILDS_PER_PLAN,
  CREDIT_COST_PER_BUILD,
  CREDIT_COST_PER_BUILD_BEST,
  CREDIT_COST_PER_BUILD_CLAUDE,
  CREDITS_PER_PLAN,
  FLAT_PROFIT_USD,
  shellCreditsForUsage,
} from "../lib/credits-constants";

describe("pricing constants", () => {
  it("keeps the flat $1 margin", () => {
    expect(FLAT_PROFIT_USD).toBe(1);
  });

  it("has a positive real cost for every model tier", () => {
    for (const tier of ["fast", "best", "claude"] as const) {
      expect(BUILD_COST_USD[tier]).toBeGreaterThan(0);
    }
  });

  it("charges tier credits in clean multiples of 50", () => {
    expect(CREDIT_COST_PER_BUILD_BEST % 50).toBe(0);
    expect(CREDIT_COST_PER_BUILD_CLAUDE % 50).toBe(0);
  });

  it("derives plan credits from builds x default build cost", () => {
    for (const [id, builds] of Object.entries(BUILDS_PER_PLAN)) {
      expect(CREDITS_PER_PLAN[id as keyof typeof BUILDS_PER_PLAN]).toBe(builds * CREDIT_COST_PER_BUILD);
    }
  });
});

describe("shellCreditsForUsage", () => {
  it("charges at least 1 credit, even for empty usage", () => {
    expect(shellCreditsForUsage({})).toBe(1);
    expect(shellCreditsForUsage({ input_tokens: null, output_tokens: null })).toBe(1);
  });

  it("never decreases as usage grows", () => {
    const small = shellCreditsForUsage({ input_tokens: 1_000, output_tokens: 500 });
    const large = shellCreditsForUsage({ input_tokens: 100_000, output_tokens: 50_000 });
    expect(large).toBeGreaterThan(small);
  });

  it("charges less for cache reads than for fresh input", () => {
    const fresh = shellCreditsForUsage({ input_tokens: 500_000 });
    const cached = shellCreditsForUsage({ cache_read_input_tokens: 500_000 });
    expect(cached).toBeLessThan(fresh);
  });
});
