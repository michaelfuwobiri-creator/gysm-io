import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ sql: Object.assign(vi.fn(() => Promise.resolve([])), {}) }));
const files: Record<string, string> = {
  "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  "styles.css": "a{}",
};
vi.mock("@/lib/projectFiles", () => ({
  getProjectFile: vi.fn(async (_id: string, path: string) => (files[path] !== undefined ? { path, content: files[path] } : null)),
}));
import { serveBuildFile } from "@/lib/serveBuild";
import { agentToolsFor } from "@/lib/agentCore";

describe("serveBuildFile", () => {
  it("decodes binary files and sets their type", async () => {
    const res = await serveBuildFile("id", ["logo.png"], { sandbox: true });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox/);
  });
  it("serves text as is and 404s unknown or disallowed paths", async () => {
    expect(await (await serveBuildFile("id", ["styles.css"], { sandbox: false })).text()).toBe("a{}");
    expect((await serveBuildFile("id", ["missing.png"], { sandbox: true })).status).toBe(404);
    expect((await serveBuildFile("id", ["..", "x.png"], { sandbox: true })).status).toBe(404);
  });
});

describe("tools offered to the model", () => {
  it("does not offer set_env now that sites are static", () => {
    const names = agentToolsFor(false).map((t: any) => t.function.name);
    expect(names).toContain("deploy");
    expect(names).not.toContain("set_env");
  });
});
