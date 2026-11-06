// Pure helpers for Edit and Rewrite in the Agent UI. The browser keeps two
// parallel records of a chat: the visible timeline (items) and the model
// history (OpenAI messages). Editing or rewriting a user message cuts both
// back to just before it and sends the (new) text again.

type Msg = { role: string; [k: string]: unknown };
type Item = { kind: string; [k: string]: unknown };

/**
 * Cuts the model history back to just before the user message that matches
 * the `positionFromEnd`-th user item from the end of the timeline (0 = the
 * latest user message). Counting from the end keeps this correct even when
 * old messages were trimmed from the history. Returns null if that message
 * is no longer in the history (too old to redo).
 */
export function messagesBeforeUser<T extends Msg>(messages: T[], positionFromEnd: number): T[] | null {
  const userIdx: number[] = [];
  messages.forEach((m, i) => {
    if (m.role === "user") userIdx.push(i);
  });
  const k = userIdx.length - 1 - positionFromEnd;
  if (k < 0 || positionFromEnd < 0) return null;
  return messages.slice(0, userIdx[k]);
}

/** Where a user item sits counting user items from the end (0 = latest), or -1 if it is not a user item. */
export function userPositionFromEnd(items: Item[], itemId: string): number {
  const users = items.filter((i) => i.kind === "user");
  const at = users.findIndex((i) => i.id === itemId);
  return at === -1 ? -1 : users.length - 1 - at;
}

/** Keeps the timeline before the given item. */
export function itemsBefore<T extends Item>(items: T[], itemId: string): T[] {
  const at = items.findIndex((i) => i.id === itemId);
  return at === -1 ? items : items.slice(0, at);
}

/** The user item a rewrite should redo: the nearest user item before the given AI item. */
export function userItemBefore<T extends Item>(items: T[], aiItemId: string): T | null {
  const at = items.findIndex((i) => i.id === aiItemId);
  for (let i = at - 1; i >= 0; i--) if (items[i].kind === "user") return items[i];
  return null;
}
