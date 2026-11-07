import { describe, expect, it } from "vitest";
import { isSupabaseRef, publicProjectList } from "@/lib/backendPick";

describe("backendPick", () => {
  it("accepts only real project refs", () => {
    expect(isSupabaseRef("xssfcdudjzkgqtschnjk")).toBe(true);
    for (const bad of ["", "short", "XSSFCDUDJZKGQTSCHNJK", "xssfcdudjzkgqtschnjk/../x", 5, null]) expect(isSupabaseRef(bad)).toBe(false);
  });
  it("shows only name, region and status of each project", () => {
    const list = publicProjectList([
      { ref: "xssfcdudjzkgqtschnjk", name: "inolly", region: "eu-west-2", status: "ACTIVE_HEALTHY", database: { host: "secret" }, organization_id: "o" },
      { ref: "bad", name: "x" },
      "junk",
    ]);
    expect(list).toEqual([{ ref: "xssfcdudjzkgqtschnjk", name: "inolly", region: "eu-west-2", status: "ACTIVE_HEALTHY" }]);
    expect(publicProjectList(null)).toEqual([]);
  });
});
