import { describe, it, expect } from "vitest";
import {
  evaluate, permits, isPermitted, normalizeScope, normalizePermissions, parseAction, riskLevel, shouldQuarantine, nonNegInt,
  type AgentPolicy,
} from "@/lib/shieldCore";

const policy = (over: Partial<AgentPolicy> = {}): AgentPolicy => ({
  status: "active",
  permissions: ["crm:read", "email:send"],
  rate_limit_per_min: 5,
  bulk_limit: 100,
  payment_limit_cents: 0,
  ...over,
});

describe("scopes", () => {
  it("normalizes and validates", () => {
    expect(normalizeScope(" CRM:Read ")).toBe("crm:read");
    expect(normalizeScope("*")).toBe("*");
    expect(normalizeScope("crm:*")).toBe("crm:*");
    expect(normalizeScope("bad scope")).toBeNull();
    expect(normalizeScope("")).toBeNull();
    expect(normalizeScope(5)).toBeNull();
    expect(normalizePermissions(["a:b", "a:b", "c"])).toEqual(["a:b", "c"]);
    expect(normalizePermissions(["a b"])).toBeNull();
    expect(normalizePermissions("x")).toBeNull();
  });
  it("matches wildcards", () => {
    expect(permits("*", "anything:else")).toBe(true);
    expect(permits("crm:*", "crm:read")).toBe(true);
    expect(permits("crm:*", "crmx:read")).toBe(false);
    expect(permits("crm:read", "crm:write")).toBe(false);
    expect(isPermitted(["email:send"], "email:send")).toBe(true);
    expect(isPermitted([], "email:send")).toBe(false);
  });
});

describe("evaluate", () => {
  it("allows an in-policy action", () => {
    const d = evaluate(policy(), { scope: "crm:read", records: 10 }, 0);
    expect(d).toEqual({ allowed: true, reasons: [], alerts: [] });
  });
  it("denies a scope violation with a high alert", () => {
    const d = evaluate(policy(), { scope: "billing:read" }, 0);
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain("scope_not_granted");
    expect(d.alerts[0]).toMatchObject({ severity: "high", kind: "scope_violation" });
  });
  it("flags bulk access as critical", () => {
    const d = evaluate(policy(), { scope: "crm:read", records: 5000 }, 0);
    expect(d.allowed).toBe(false);
    expect(d.alerts.map((a) => a.kind)).toEqual(["bulk_access"]);
    expect(d.alerts[0].severity).toBe("critical");
  });
  it("blocks payments over the limit, allows within it", () => {
    expect(evaluate(policy(), { scope: "crm:read", amount_cents: 5000 }, 0).reasons).toContain("payment_blocked");
    expect(evaluate(policy({ payment_limit_cents: 10000 }), { scope: "crm:read", amount_cents: 5000 }, 0).allowed).toBe(true);
  });
  it("flags rate anomalies at the limit", () => {
    expect(evaluate(policy(), { scope: "crm:read" }, 4).allowed).toBe(true);
    const d = evaluate(policy(), { scope: "crm:read" }, 5);
    expect(d.allowed).toBe(false);
    expect(d.alerts[0].kind).toBe("rate_anomaly");
  });
  it("accumulates several violations", () => {
    const d = evaluate(policy(), { scope: "billing:read", records: 999, amount_cents: 1 }, 9);
    expect(d.reasons.sort()).toEqual(["bulk_limit_exceeded", "payment_blocked", "rate_limit_exceeded", "scope_not_granted"]);
    expect(d.alerts).toHaveLength(4);
  });
  it("blocks quarantined and paused agents", () => {
    const q = evaluate(policy({ status: "quarantined" }), { scope: "crm:read" }, 0);
    expect(q.allowed).toBe(false);
    expect(q.reasons).toEqual(["agent_quarantined"]);
    expect(q.alerts).toHaveLength(1);
    const p = evaluate(policy({ status: "paused" }), { scope: "crm:read" }, 0);
    expect(p).toEqual({ allowed: false, reasons: ["agent_paused"], alerts: [] });
  });
});

describe("risk and quarantine", () => {
  it("risk is the worst open severity", () => {
    expect(riskLevel([])).toBe("low");
    expect(riskLevel([{ severity: "medium" }, { severity: "high" }, { severity: "low" }])).toBe("high");
    expect(riskLevel([{ severity: "critical" }])).toBe("critical");
  });
  it("quarantines on critical or repeated serious alerts", () => {
    expect(shouldQuarantine([{ severity: "critical", kind: "x", message: "" }], 1)).toBe(true);
    expect(shouldQuarantine([{ severity: "high", kind: "x", message: "" }], 1)).toBe(false);
    expect(shouldQuarantine([{ severity: "high", kind: "x", message: "" }], 3)).toBe(true);
    expect(shouldQuarantine([], 0)).toBe(false);
  });
});

describe("parseAction / nonNegInt", () => {
  it("parses a valid body and rejects bad ones", () => {
    expect(parseAction({ scope: "CRM:Read", action: "export\n contacts", records: 12.9, amount_cents: 500 })).toEqual({
      scope: "crm:read", action: "export  contacts", records: 12, amount_cents: 500,
    });
    expect(parseAction(null)).toBeNull();
    expect(parseAction({})).toBeNull();
    expect(parseAction({ scope: "ok", records: -1 })).toBeNull();
    expect(parseAction({ scope: "ok", amount_cents: "abc" })).toBeNull();
  });
  it("clamps numbers", () => {
    expect(nonNegInt("60", 1)).toBe(60);
    expect(nonNegInt(-5, 7)).toBe(7);
    expect(nonNegInt("x", 7)).toBe(7);
    expect(nonNegInt(1e12, 7, 1000)).toBe(1000);
  });
});
