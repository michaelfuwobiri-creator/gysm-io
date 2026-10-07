import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFileText } from "../lib/githubPush";
import { MAX_PULL_BYTES } from "../lib/githubPull";

function respond(status: number, body = "", headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue(new Response(body, { status, headers }));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchFileText", () => {
  it("returns the file text and asks GitHub for the raw contents", async () => {
    const fetchMock = respond(200, "<!DOCTYPE html><html></html>");
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchFileText("tok", "me", "app", "main", "index.html");
    expect(r).toEqual({ ok: true, content: "<!DOCTYPE html><html></html>" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/me/app/contents/index.html?ref=main");
    expect(init.headers.Accept).toBe("application/vnd.github.raw+json");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("flags a missing file as notFound", async () => {
    vi.stubGlobal("fetch", respond(404));
    const r = await fetchFileText("tok", "me", "app", "main", "index.html");
    expect(r.ok).toBe(false);
    expect((r as { notFound?: boolean }).notFound).toBe(true);
  });

  it("explains a rejected token", async () => {
    vi.stubGlobal("fetch", respond(401));
    const r = await fetchFileText("bad", "me", "app", "main", "index.html");
    expect((r as { error: string }).error).toContain("token was rejected");
  });

  it("refuses a file larger than the limit before reading it", async () => {
    vi.stubGlobal("fetch", respond(200, "x", { "content-length": String(MAX_PULL_BYTES + 1) }));
    const r = await fetchFileText("tok", "me", "app", "main", "index.html");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("2 MB");
  });

  it("turns a network failure into an error result instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await fetchFileText("tok", "me", "app", "main", "index.html");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toContain("offline");
  });
});
