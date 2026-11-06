import { describe, expect, it } from "vitest";
import { itemsBefore, messagesBeforeUser, userItemBefore, userPositionFromEnd } from "@/lib/agentHistory";

const msgs = [
  { role: "user", content: "one" },
  { role: "assistant", content: "a1" },
  { role: "user", content: "two" },
  { role: "assistant", content: null, tool_calls: [{}] },
  { role: "tool", content: "r" },
  { role: "assistant", content: "a2" },
];

describe("messagesBeforeUser", () => {
  it("cuts before the latest or an earlier user message", () => {
    expect(messagesBeforeUser(msgs, 0)).toEqual(msgs.slice(0, 2));
    expect(messagesBeforeUser(msgs, 1)).toEqual([]);
  });
  it("returns null when the message was trimmed from history", () => {
    expect(messagesBeforeUser(msgs, 2)).toBeNull();
    expect(messagesBeforeUser(msgs, -1)).toBeNull();
  });
  it("lines up from the end when old messages were trimmed", () => {
    expect(messagesBeforeUser(msgs.slice(2), 0)).toEqual([]);
    expect(messagesBeforeUser(msgs.slice(2), 1)).toBeNull();
  });
});

describe("timeline helpers", () => {
  const items = [
    { id: "u1", kind: "user", text: "one" },
    { id: "a1", kind: "ai", text: "a1" },
    { id: "t1", kind: "tool" },
    { id: "u2", kind: "user", text: "two" },
    { id: "a2", kind: "ai", text: "a2" },
  ];
  it("finds a user item's position from the end", () => {
    expect(userPositionFromEnd(items, "u2")).toBe(0);
    expect(userPositionFromEnd(items, "u1")).toBe(1);
    expect(userPositionFromEnd(items, "a1")).toBe(-1);
  });
  it("keeps only what came before an item", () => {
    expect(itemsBefore(items, "u2").map((i) => i.id)).toEqual(["u1", "a1", "t1"]);
    expect(itemsBefore(items, "nope")).toHaveLength(5);
  });
  it("finds the user item a rewrite should redo", () => {
    expect(userItemBefore(items, "a2")?.id).toBe("u2");
    expect(userItemBefore(items, "a1")?.id).toBe("u1");
    expect(userItemBefore(items, "u1")).toBeNull();
  });
});
