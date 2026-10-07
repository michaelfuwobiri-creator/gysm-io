import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/db", () => ({ sql: () => Promise.resolve([]) }));
const getProjectFile = vi.fn();
vi.mock("../lib/projectFiles", () => ({ getProjectFile: (...a: unknown[]) => getProjectFile(...a) }));

import { GET } from "../app/a/[id]/[[...path]]/route";
import { isUserContentHost, userContentOrigin, appFrameUrl } from "../lib/userContent";

const ID = "123e4567-e89b-12d3-a456-426614174000";
const req = (host: string) => ({ headers: new Headers({ host }) }) as any;
const call = (host: string, path?: string[], id = ID) => GET(req(host), { params: { id, path } });

beforeEach(() => {
  getProjectFile.mockReset();
  getProjectFile.mockImplementation(async (_id: string, path: string) =>
    path === "index.html" ? { path, content: "<html><head></head></html>" } : path === "app.js" ? { path, content: "1" } : null
  );
});
afterEach(() => {
  delete process.env.USER_CONTENT_ORIGIN;
});

describe("userContent helpers", () => {
  it("is off without the env var", () => {
    expect(userContentOrigin()).toBeNull();
    expect(appFrameUrl(ID)).toBeNull();
    expect(isUserContentHost("anything")).toBe(false);
  });
  it("builds frame URLs and matches the host", () => {
    process.env.USER_CONTENT_ORIGIN = "https://gysm-apps.vercel.app/";
    expect(userContentOrigin()).toBe("https://gysm-apps.vercel.app");
    expect(appFrameUrl(ID)).toBe(`https://gysm-apps.vercel.app/a/${ID}/`);
    expect(isUserContentHost("GYSM-apps.vercel.app")).toBe(true);
    expect(isUserContentHost("www.gysm.io")).toBe(false);
  });
});

describe("GET /a/[id]/[[...path]]", () => {
  it("not isolated: serves with a CSP sandbox that omits allow-same-origin", async () => {
    const res = await call("www.gysm.io");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("sandbox");
    expect(csp).not.toContain("allow-same-origin");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toContain('name="ai-generated"');
  });

  it("isolated: the main site 404s, the user-content host serves without a CSP sandbox", async () => {
    process.env.USER_CONTENT_ORIGIN = "https://gysm-apps.vercel.app";
    expect((await call("www.gysm.io")).status).toBe(404);
    const ok = await call("gysm-apps.vercel.app");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-security-policy")).toBeNull();
  });

  it("serves other files with the right content type and 404s unknown ones", async () => {
    const js = await call("www.gysm.io", ["app.js"]);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect((await call("www.gysm.io", ["nope.css"])).status).toBe(404);
  });

  it("rejects bad ids and traversal", async () => {
    expect((await call("www.gysm.io", undefined, "not-a-uuid")).status).toBe(404);
    expect((await call("www.gysm.io", ["..", "x.js"])).status).toBe(404);
    expect((await call("www.gysm.io", [".env.js"])).status).toBe(404);
    expect(getProjectFile).not.toHaveBeenCalled();
  });
});
