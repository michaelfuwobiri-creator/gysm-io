import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getUser: vi.fn() }));
vi.mock("@/lib/credits", () => ({ getCreditBalance: vi.fn(), chargeCredits: vi.fn() }));
vi.mock("@/lib/agent", () => ({
  runAgentTurn: vi.fn(async (o: any) => {
    o.emit({ type: "text", text: "hello" });
    o.emit({ type: "state", messages: [] });
  }),
}));

import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { runAgentTurn } from "@/lib/agent";
import { POST } from "@/app/api/agent/route";

const req = (body: any) => new Request("http://x/api/agent", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test";
  (getUser as any).mockResolvedValue({ id: "u1" });
  (getCreditBalance as any).mockResolvedValue(500);
});

describe("POST /api/agent", () => {
  it("401 when signed out", async () => {
    (getUser as any).mockResolvedValue(null);
    expect((await POST(req({ text: "hi" }))).status).toBe(401);
  });
  it("503 when the model key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    expect((await POST(req({ text: "hi" }))).status).toBe(503);
  });
  it("400 with nothing to do", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
  it("402 when out of credits, without starting a turn", async () => {
    (getCreditBalance as any).mockResolvedValue(10);
    const res = await POST(req({ text: "hi" }));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("NO_CREDITS");
    expect(runAgentTurn).not.toHaveBeenCalled();
  });
  it("streams NDJSON events", async () => {
    const res = await POST(req({ text: "hi" }));
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ type: "text", text: "hello" });
    expect((runAgentTurn as any).mock.calls[0][0].userId).toBe("u1");
  });
});
