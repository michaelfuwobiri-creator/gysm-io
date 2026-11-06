import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrCreate = vi.fn();
const get = vi.fn();
vi.mock("@vercel/sandbox", () => ({ Sandbox: { getOrCreate: (...a: any[]) => getOrCreate(...a), get: (...a: any[]) => get(...a) } }));

import { getUserSandbox, isSnapshotGone } from "@/lib/shell/sandbox";

const gone = () => Object.assign(new Error("Status code 410 is not ok: Cannot resume sandbox: no snapshot available."), { response: { status: 410 } });

beforeEach(() => vi.clearAllMocks());

describe("getUserSandbox", () => {
  it("recognises a sandbox whose snapshot is gone", () => {
    expect(isSnapshotGone(gone())).toBe(true);
    expect(isSnapshotGone(new Error("Cannot resume sandbox: no snapshot available"))).toBe(true);
    expect(isSnapshotGone(Object.assign(new Error("nope"), { response: { status: 500 } }))).toBe(false);
  });

  it("resumes up front on the happy path", async () => {
    getOrCreate.mockResolvedValueOnce({ id: "ok" });
    expect(await getUserSandbox("u")).toEqual({ id: "ok" });
    expect(getOrCreate.mock.calls[0][0].resume).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("deletes a snapshotless sandbox and starts a fresh one", async () => {
    const del = vi.fn(async () => {});
    getOrCreate.mockRejectedValueOnce(gone()).mockResolvedValueOnce({ id: "fresh" });
    get.mockResolvedValueOnce({ delete: del });
    expect(await getUserSandbox("u")).toEqual({ id: "fresh" });
    expect(get.mock.calls[0][0].resume).toBe(false);
    expect(del).toHaveBeenCalledTimes(1);
    expect(getOrCreate).toHaveBeenCalledTimes(2);
  });

  it("still recreates if the stale sandbox can't be fetched", async () => {
    getOrCreate.mockRejectedValueOnce(gone()).mockResolvedValueOnce({ id: "fresh" });
    get.mockRejectedValueOnce(Object.assign(new Error("nf"), { response: { status: 404 } }));
    expect(await getUserSandbox("u")).toEqual({ id: "fresh" });
  });

  it("passes other errors through", async () => {
    getOrCreate.mockRejectedValueOnce(new Error("boom"));
    await expect(getUserSandbox("u")).rejects.toThrow("boom");
    expect(getOrCreate).toHaveBeenCalledTimes(1);
  });
});
