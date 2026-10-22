import { it, expect, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("@/lib/shell/sandbox", () => ({ getUserSandbox: vi.fn(), runInSandbox: vi.fn() }));
vi.mock("@/lib/backendStore", () => ({ getConnection: vi.fn(), getValidAccessToken: vi.fn() }));
vi.mock("@/lib/supabaseBackend", () => ({ runSql: vi.fn() }));
vi.mock("dns", () => {
  const lookup = (host: string, _o: any, cb: any) => cb(null, [{ address: host.startsWith("evil") ? "127.0.0.1" : "169.254.169.254", family: 4 }]);
  return { default: { lookup }, lookup };
});
import { toolFetchUrl } from "@/lib/agentTools";
it("fetch_url rejects hostnames resolving to private addresses", async () => {
  for (const u of ["http://evil.example.com/", "http://meta.example.com/"]) {
    const r = await toolFetchUrl("u", { url: u });
    expect(r).toEqual({ ok: false, output: "That address isn't a public website." });
  }
});
