// Saved (archived) GYSM Agent chats, kept in the browser so the user can
// restore an old conversation. Pure helpers: no storage access here.

export type SavedChat = { id: string; title: string; savedAt: number; items: any[]; messages: unknown[] };

export const MAX_SAVED_CHATS = 20;
const MAX_ITEMS_PER_CHAT = 150;
const MAX_STORED_CHARS = 3_000_000; // stay well under the ~5 MB browser limit

/** A short title from the first thing the user asked. */
export function chatTitle(items: any[]): string {
  const first = items.find((i) => i?.kind === "user" && typeof i.text === "string" && i.text.trim());
  if (!first) return "Untitled chat";
  const line = String(first.text).split("\n")[0].replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57)}...` : line || "Untitled chat";
}

/** True when a conversation has something worth keeping. */
export function hasContent(items: any[]): boolean {
  return items.some((i) => i?.kind === "user");
}

function clean(items: any[]): any[] {
  return items.slice(-MAX_ITEMS_PER_CHAT).map((i) => (i?.kind === "file" ? { ...i, data: undefined } : i?.kind === "tool" ? { ...i, running: false } : i));
}

/** Adds (or updates) a chat at the front of the list. Nothing is added for an empty conversation. */
export function archiveChat(list: SavedChat[], id: string, items: any[], messages: unknown[], now: number): SavedChat[] {
  if (!hasContent(items)) return list;
  const entry: SavedChat = { id, title: chatTitle(items), savedAt: now, items: clean(items), messages };
  return [entry, ...list.filter((c) => c.id !== id)].slice(0, MAX_SAVED_CHATS);
}

export function removeChat(list: SavedChat[], id: string): SavedChat[] {
  return list.filter((c) => c.id !== id);
}

/** Reads the stored JSON back, ignoring anything malformed. */
export function parseChats(raw: string | null): SavedChat[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((c) => c && typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.items) && Array.isArray(c.messages))
      .map((c) => ({ id: c.id, title: c.title.slice(0, 80), savedAt: Number(c.savedAt) || 0, items: c.items, messages: c.messages }))
      .slice(0, MAX_SAVED_CHATS);
  } catch {
    return [];
  }
}

/** JSON for storage; the oldest chats are dropped until it fits. */
export function serializeChats(list: SavedChat[]): string {
  let l = list;
  let json = JSON.stringify(l);
  while (json.length > MAX_STORED_CHARS && l.length > 0) {
    l = l.slice(0, -1);
    json = JSON.stringify(l);
  }
  return json;
}
