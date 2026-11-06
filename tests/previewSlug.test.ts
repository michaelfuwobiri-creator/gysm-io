import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
import { cleanSlug, previewLinkFor, slugFromHost, slugProblem } from "@/lib/previewSlug";
import { sql } from "@/lib/db";
import { projectIdForSlug, setPreviewSlug } from "@/lib/agentProjects";

afterEach(() => {
  vi.unstubAllEnvs();
  (sql as any).mockReset();
});

describe("cleanSlug / slugProblem", () => {
  it("makes safe names", () => {
    expect(cleanSlug("My Cool_App!!")).toBe("my-cool-app");
    expect(cleanSlug("  --Src--  ")).toBe("src");
    expect(cleanSlug("Café Ñandú")).toBe("cafe-nandu");
    expect(cleanSlug("a".repeat(60)).length).toBe(32);
    expect(cleanSlug(undefined)).toBe("");
  });
  it("rejects short, reserved and odd names", () => {
    expect(slugProblem("ab")).toMatch(/at least/);
    expect(slugProblem("www")).toMatch(/reserved/);
    expect(slugProblem("info")).toMatch(/reserved/);
    expect(slugProblem("-bad-")).toMatch(/letters/);
    expect(slugProblem("src")).toBeNull();
    expect(slugProblem("heartline-2")).toBeNull();
  });
});

describe("links and hosts", () => {
  it("uses a path link until subdomains are on", () => {
    expect(previewLinkFor("src", "https://www.gysm.io")).toBe("https://www.gysm.io/s/src");
    vi.stubEnv("PREVIEW_SUBDOMAINS", "1");
    expect(previewLinkFor("src", "https://www.gysm.io")).toBe("https://src.gysm.io");
  });
  it("reads the name from a host only when enabled", () => {
    expect(slugFromHost("src.gysm.io")).toBeNull();
    vi.stubEnv("PREVIEW_SUBDOMAINS", "1");
    expect(slugFromHost("src.gysm.io")).toBe("src");
    expect(slugFromHost("SRC.gysm.io:443")).toBe("src");
    expect(slugFromHost("www.galaxy-school.gysm.io")).toBe("galaxy-school");
    expect(slugFromHost("galaxy-school.gysm.io.")).toBe("galaxy-school");
    expect(slugFromHost("www.gysm.io")).toBeNull();
    expect(slugFromHost("www.www.gysm.io")).toBeNull();
    expect(slugFromHost("x.www.src.gysm.io")).toBeNull();
    expect(slugFromHost("gysm.io")).toBeNull();
    expect(slugFromHost("a.b.gysm.io")).toBeNull();
    expect(slugFromHost("src.example.com")).toBeNull();
    expect(slugFromHost("info.gysm.io")).toBeNull();
    expect(slugFromHost(null)).toBeNull();
  });
});

describe("setPreviewSlug / projectIdForSlug", () => {
  const taken = Object.assign(new Error("dup"), { code: "23505" });
  const missing = Object.assign(new Error("no col"), { code: "42703" });

  it("keeps the current name when none is asked for", async () => {
    (sql as any).mockResolvedValueOnce([{ preview_slug: "src" }]);
    expect(await setPreviewSlug({ id: "i", userId: "u", fallbackFrom: "Heartline" })).toEqual({ slug: "src" });
  });
  it("makes a name from the project and skips taken ones", async () => {
    (sql as any).mockResolvedValueOnce([{ preview_slug: null }]).mockRejectedValueOnce(taken).mockResolvedValueOnce([]);
    expect(await setPreviewSlug({ id: "i", userId: "u", fallbackFrom: "Heartline" })).toEqual({ slug: "heartline-2", created: true });
  });
  it("reports a taken or invalid asked-for name", async () => {
    (sql as any).mockResolvedValueOnce([{ preview_slug: null }]).mockRejectedValueOnce(taken);
    const r = await setPreviewSlug({ id: "i", userId: "u", wanted: "Src", fallbackFrom: "x" });
    expect(r.taken).toBe(true);
    expect(r.error).toMatch(/already taken/);
    (sql as any).mockResolvedValueOnce([{ preview_slug: null }]);
    expect((await setPreviewSlug({ id: "i", userId: "u", wanted: "www", fallbackFrom: "x" })).error).toMatch(/reserved/);
  });
  it("saves a free asked-for name", async () => {
    (sql as any).mockResolvedValueOnce([{ preview_slug: null }]).mockResolvedValueOnce([]);
    expect(await setPreviewSlug({ id: "i", userId: "u", wanted: "My Site", fallbackFrom: "x" })).toEqual({ slug: "my-site", previous: null, created: true });
  });
  it("falls back to no name when migration 0035 is missing", async () => {
    (sql as any).mockRejectedValueOnce(missing);
    expect(await setPreviewSlug({ id: "i", userId: "u", fallbackFrom: "x" })).toEqual({ slug: null });
    (sql as any).mockRejectedValueOnce(missing);
    expect(await projectIdForSlug("src")).toBeNull();
  });
  it("looks a name up", async () => {
    (sql as any).mockResolvedValueOnce([{ id: "abc" }]);
    expect(await projectIdForSlug("src")).toBe("abc");
  });
});
