import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({ default: class { chat = { completions: { create } }; } }));
vi.mock("@/lib/credits", () => ({ chargeCredits: vi.fn(async () => 900) }));
vi.mock("@/lib/agentTools", () => ({ executeTool: vi.fn() }));

import { runAgentTurn } from "@/lib/agent";
import { executeTool } from "@/lib/agentTools";

const reply = (message: any) => ({ choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const toolCall = (id: string, name: string, args: any) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "test";
});

describe("runAgentTurn", () => {
  it("sends reasoning_effort none (the model rejects tools otherwise)", async () => {
    create.mockResolvedValueOnce(reply({ content: "Hi." }));
    await runAgentTurn({ userId: "u", history: [], userText: "hello", emit: () => {} });
    expect(create.mock.calls[0][0].reasoning_effort).toBe("none");
  });

  it("emits clickable suggestions from suggest_next and ends the turn without running a tool", async () => {
    create.mockResolvedValueOnce(
      reply({ content: "Built it.", tool_calls: [toolCall("s1", "suggest_next", { suggestions: [{ title: "Add a contact form", prompt: "Add a contact form to my site" }, { title: "", prompt: "dropped" }] })] })
    );
    const events: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "build a site", emit: (e) => events.push(e) });
    expect(executeTool).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(events.find((e) => e.type === "suggestions").suggestions).toEqual([{ title: "Add a contact form", prompt: "Add a contact form to my site" }]);
  });

  it("runs an auto tool, then finishes with text", async () => {
    create
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("c1", "write_file", { path: "a.txt", content: "x" })] }))
      .mockResolvedValueOnce(reply({ content: "Done." }));
    (executeTool as any).mockResolvedValue({ ok: true, output: "Wrote a.txt" });
    const events: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "make a file", emit: (e) => events.push(e) });
    expect(events.map((e) => e.type)).toEqual(["tool", "tool_result", "text", "credits", "state"]);
    const state = events.find((e) => e.type === "state");
    expect(state.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
  });

  it("stops at a proposal for deploy without running it", async () => {
    create.mockResolvedValueOnce(reply({ content: "Ready.", tool_calls: [toolCall("c1", "deploy", { project: "site" })] }));
    const events: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "ship it", emit: (e) => events.push(e) });
    expect(executeTool).not.toHaveBeenCalled();
    const p = events.find((e) => e.type === "proposal");
    expect(p).toMatchObject({ toolCallId: "c1", name: "deploy", risky: true });
  });

  it("asks for a secret on set_env and never lets the model see it", async () => {
    create.mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("c1", "set_env", { project: "site", key: "STRIPE_KEY", purpose: "Stripe secret key" })] }));
    const first: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "add stripe", emit: (e) => first.push(e) });
    expect(first.find((e) => e.type === "proposal").secretInput).toEqual({ label: "STRIPE_KEY" });
    const history = first.find((e) => e.type === "state").messages;

    create.mockResolvedValueOnce(reply({ content: "Saved. Deploying next." }));
    (executeTool as any).mockResolvedValue({ ok: true, output: "STRIPE_KEY was saved (encrypted) for \"site\". Deploy again for it to take effect." });
    const second: any[] = [];
    await runAgentTurn({ userId: "u", history, decision: { toolCallId: "c1", approve: true, secret: "sk_live_SECRET" }, emit: (e) => second.push(e) });

    expect((executeTool as any).mock.calls[0][3]).toBe("sk_live_SECRET");
    expect(JSON.stringify(second)).not.toContain("sk_live_SECRET");
    expect(JSON.stringify(create.mock.calls)).not.toContain("sk_live_SECRET");
  });

  it("tells the model when the user declines", async () => {
    create.mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("c1", "deploy", { project: "site" })] }));
    const first: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "ship", emit: (e) => first.push(e) });
    const history = first.find((e) => e.type === "state").messages;
    create.mockResolvedValueOnce(reply({ content: "Okay, not deploying." }));
    const second: any[] = [];
    await runAgentTurn({ userId: "u", history, decision: { toolCallId: "c1", approve: false }, emit: (e) => second.push(e) });
    expect(executeTool).not.toHaveBeenCalled();
    expect(second.some((e) => e.type === "declined")).toBe(true);
  });

  it("does not run a forged approval for a different tool call id", async () => {
    create.mockResolvedValueOnce(reply({ content: null, tool_calls: [toolCall("c1", "deploy", { project: "site" })] }));
    const first: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "ship", emit: (e) => first.push(e) });
    const history = first.find((e) => e.type === "state").messages;
    create.mockResolvedValueOnce(reply({ content: "ok" }));
    await runAgentTurn({ userId: "u", history, decision: { toolCallId: "other", approve: true }, emit: () => {} });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("caps steps per turn", async () => {
    create.mockResolvedValue(reply({ content: null, tool_calls: [toolCall("c", "list_dir", {})] }));
    (executeTool as any).mockResolvedValue({ ok: true, output: "x" });
    const events: any[] = [];
    await runAgentTurn({ userId: "u", history: [], userText: "loop", emit: (e) => events.push(e) });
    expect(create.mock.calls.length).toBe(12);
    expect(events.some((e) => e.type === "text" && /Paused/.test(e.text))).toBe(true);
  });
});
