import { describe, it, expect, vi } from "vitest";

// outreach.ts pulls in the DB and channel clients; none are touched here.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
import { coldEmailAllowed, isAgencyLead } from "@/lib/voiie/compliance";
import { renderTemplate } from "@/lib/voiie/outreach";

const base = { platform: "manual", bio: null, contact_phone: null, contact_email: "hello@agency.example", do_not_contact: false } as any;

describe("agency partner leads", () => {
  it("are never cleared for automated cold email", () => {
    expect(isAgencyLead({ tags: ["agency"] })).toBe(true);
    expect(coldEmailAllowed({ ...base, tags: ["agency"] }).ok).toBe(false);
    expect(coldEmailAllowed({ ...base, tags: [] }).ok).toBe(true);
  });

  it("get no demo link appended when no link is passed", () => {
    const lead = { handle: "@x", signal: null, display_name: "Agency" } as any;
    expect(renderTemplate("Hi {name}", lead)).toBe("Hi Agency");
    expect(renderTemplate("Hi {name}", lead, "https://l")).toContain("Start here");
  });
});
