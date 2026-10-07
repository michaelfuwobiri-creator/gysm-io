import { describe, expect, it } from "vitest";
import { classifyBuild, parseIssues, summarize, type SecurityRow } from "../lib/securitySummary";

const row = (over: Partial<SecurityRow>): SecurityRow => ({
  id: "1",
  label: "App",
  isPublic: false,
  checkStatus: "pass",
  issues: [],
  checkedAt: null,
  ...over,
});

const secret = { type: "exposed_secret", message: "Stripe secret or restricted key found in the page source", detail: "sk_liv...ab" };
const broken = { type: "broken_anchor", message: "1 in-page link points to a section that doesn't exist." };

describe("parseIssues", () => {
  it("accepts parsed arrays and JSON strings", () => {
    expect(parseIssues([broken])).toEqual([broken]);
    expect(parseIssues(JSON.stringify([secret]))).toEqual([secret]);
  });
  it("returns an empty list for null, junk and malformed entries", () => {
    expect(parseIssues(null)).toEqual([]);
    expect(parseIssues("not json")).toEqual([]);
    expect(parseIssues({ a: 1 })).toEqual([]);
    expect(parseIssues([{ type: 5 }, null, broken])).toEqual([broken]);
  });
});

describe("classifyBuild", () => {
  it("separates leaked secrets from quality issues", () => {
    const b = classifyBuild(row({ checkStatus: "warnings", issues: [broken, secret] }));
    expect(b.level).toBe("secret");
    expect(b.secrets).toEqual([secret]);
    expect(b.quality).toEqual([broken]);
  });
  it("marks never-scanned builds as unchecked, whatever their issue list", () => {
    expect(classifyBuild(row({ checkStatus: null })).level).toBe("unchecked");
  });
  it("marks passing builds clean and others as quality", () => {
    expect(classifyBuild(row({})).level).toBe("clean");
    expect(classifyBuild(row({ checkStatus: "warnings", issues: [broken] })).level).toBe("quality");
  });
});

describe("summarize", () => {
  it("counts each level and lists exposed keys first, published before private", () => {
    const o = summarize([
      row({ id: "clean" }),
      row({ id: "q", checkStatus: "warnings", issues: [broken] }),
      row({ id: "secret-private", checkStatus: "warnings", issues: [secret] }),
      row({ id: "secret-public", isPublic: true, checkStatus: "warnings", issues: [secret] }),
      row({ id: "new", checkStatus: null }),
    ]);
    expect(o.total).toBe(5);
    expect(o.withSecrets).toBe(2);
    expect(o.withQualityIssues).toBe(1);
    expect(o.unchecked).toBe(1);
    expect(o.clean).toBe(1);
    expect(o.builds.map((b) => b.id)).toEqual(["secret-public", "secret-private", "q", "new", "clean"]);
  });
  it("handles no builds", () => {
    expect(summarize([]).total).toBe(0);
  });
});
