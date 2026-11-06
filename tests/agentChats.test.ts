import { describe, expect, it } from "vitest";
import { MAX_SAVED_CHATS, archiveChat, chatTitle, hasContent, parseChats, removeChat, serializeChats } from "@/lib/agentChats";

const items = (text: string) => [{ id: "1", kind: "user", text }, { id: "2", kind: "ai", text: "ok" }];

describe("chatTitle / hasContent", () => {
  it("uses the first user message, trimmed", () => {
    expect(chatTitle(items("Build a bakery site\n\nAttached: logo.png"))).toBe("Build a bakery site");
    expect(chatTitle(items("x".repeat(100))).length).toBe(60);
    expect(chatTitle([])).toBe("Untitled chat");
  });
  it("only counts chats with a user message", () => {
    expect(hasContent([])).toBe(false);
    expect(hasContent([{ kind: "note", text: "hi" }])).toBe(false);
    expect(hasContent(items("hi"))).toBe(true);
  });
});

describe("archiveChat", () => {
  it("adds a chat at the front, updating one with the same id", () => {
    let l = archiveChat([], "a", items("first"), [], 1);
    l = archiveChat(l, "b", items("second"), [], 2);
    l = archiveChat(l, "a", items("first again"), [], 3);
    expect(l.map((c) => [c.id, c.title])).toEqual([["a", "first again"], ["b", "second"]]);
  });
  it("ignores empty conversations and caps the list", () => {
    expect(archiveChat([], "a", [], [], 1)).toEqual([]);
    let l: any[] = [];
    for (let i = 0; i < MAX_SAVED_CHATS + 5; i++) l = archiveChat(l, `c${i}`, items(`q${i}`), [], i);
    expect(l).toHaveLength(MAX_SAVED_CHATS);
    expect(l[0].id).toBe(`c${MAX_SAVED_CHATS + 4}`);
  });
  it("drops downloaded file bytes and stuck 'running' tools", () => {
    const l = archiveChat([], "a", [...items("hi"), { id: "f", kind: "file", name: "a.pdf", mime: "x", data: "BIG" }, { id: "t", kind: "tool", running: true }], [], 1);
    expect(l[0].items[2].data).toBeUndefined();
    expect(l[0].items[3].running).toBe(false);
  });
});

describe("removeChat / parseChats / serializeChats", () => {
  it("removes by id", () => {
    const l = archiveChat(archiveChat([], "a", items("1"), [], 1), "b", items("2"), [], 2);
    expect(removeChat(l, "a").map((c) => c.id)).toEqual(["b"]);
  });
  it("round-trips and ignores junk", () => {
    const l = archiveChat([], "a", items("hello"), [{ role: "user", content: "hello" }], 5);
    expect(parseChats(serializeChats(l))).toEqual(l);
    expect(parseChats("not json")).toEqual([]);
    expect(parseChats(JSON.stringify([{ id: 1 }, null]))).toEqual([]);
    expect(parseChats(null)).toEqual([]);
  });
  it("drops the oldest chats when too big to store", () => {
    const big = "x".repeat(1_200_000);
    let l = archiveChat([], "old", items("old"), [big], 1);
    l = archiveChat(l, "mid", items("mid"), [big], 2);
    l = archiveChat(l, "new", items("new"), [big], 3);
    const kept = parseChats(serializeChats(l));
    expect(kept.map((c) => c.id)).toEqual(["new", "mid"]);
  });
});
