import { describe, expect, it } from "vitest";
import { autoApproves, cleanAutonomy, cleanRequestedScopes, cleanRequestedSteps, remainingSteps } from "@/lib/agentAutonomy";

describe("cleanAutonomy", () => {
  it("accepts a valid grant", () => {
    expect(cleanAutonomy({ scopes: ["database", "publish"], maxSteps: 40, used: 3 })).toEqual({ scopes: ["database", "publish"], maxSteps: 40, used: 3 });
  });
  it("is not autonomous without a usable scope or with junk", () => {
    for (const bad of [null, undefined, "yes", 5, {}, { scopes: [] }, { scopes: ["secrets"] }, { scopes: "database" }]) expect(cleanAutonomy(bad)).toBeNull();
  });
  it("drops unknown scopes and duplicates, and clamps the budget", () => {
    expect(cleanAutonomy({ scopes: ["publish", "publish", "rm -rf"], maxSteps: 9999, used: -4 })).toEqual({ scopes: ["publish"], maxSteps: 120, used: 0 });
    expect(cleanAutonomy({ scopes: ["publish"], maxSteps: 1, used: 99 })).toEqual({ scopes: ["publish"], maxSteps: 5, used: 5 });
    expect(cleanAutonomy({ scopes: ["publish"] })?.maxSteps).toBe(40);
  });
});

describe("autoApproves", () => {
  const grant = { scopes: ["database" as const], maxSteps: 10, used: 0 };
  it("covers only the granted scopes", () => {
    expect(autoApproves("create_db_table", grant)).toBe(true);
    expect(autoApproves("deploy", grant)).toBe(false);
    expect(autoApproves("deploy", { ...grant, scopes: ["publish"] })).toBe(true);
  });
  it("never covers secrets, commands or anything else", () => {
    const all = { scopes: ["database" as const, "publish" as const], maxSteps: 10, used: 0 };
    all.scopes.push("browser" as any);
    for (const t of ["set_env", "run_command", "local_write", "browser_click", "write_file"]) expect(autoApproves(t, all)).toBe(false);
  });
  it("stops when the budget is used up or there is no grant", () => {
    expect(autoApproves("create_db_table", { ...grant, used: 10 })).toBe(false);
    expect(autoApproves("create_db_table", null)).toBe(false);
    expect(remainingSteps({ ...grant, used: 4 })).toBe(6);
    expect(remainingSteps(null)).toBe(0);
  });
});

describe("what the model may request", () => {
  it("defaults to all scopes and a normal budget", () => {
    expect(cleanRequestedScopes(undefined)).toEqual(["database", "publish"]);
    expect(cleanRequestedScopes(["browser", "x"])).toEqual(["browser"]);
    expect(cleanRequestedScopes(["publish", "x"])).toEqual(["publish"]);
    expect(cleanRequestedSteps(undefined)).toBe(40);
    expect(cleanRequestedSteps(1000)).toBe(120);
    expect(cleanRequestedSteps(2)).toBe(5);
  });
});
