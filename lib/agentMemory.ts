import { sql } from "@/lib/db";
import { MAX_MEMORIES, cleanMemoryText, memoryBlock, type Memory } from "@/lib/agentMemoryCore";

// Storage for GYSM Agent memory. Every query is scoped to the user's own id.
// Best effort: if the table has not been migrated yet, the agent still works.

export async function listMemories(userId: string): Promise<Memory[]> {
  try {
    const rows = (await sql`select id, text from agent_memory where user_id = ${userId} order by id asc limit ${MAX_MEMORIES}`) as any[];
    return rows.map((r) => ({ id: Number(r.id), text: String(r.text) }));
  } catch {
    return [];
  }
}

export async function loadMemoryBlock(userId: string): Promise<string> {
  return memoryBlock(await listMemories(userId));
}

export async function addMemory(userId: string, raw: unknown): Promise<{ ok: boolean; output: string }> {
  const c = cleanMemoryText(raw);
  if (c.ok === false) return { ok: false, output: c.error };
  const existing = await listMemories(userId);
  if (existing.some((m) => m.text.toLowerCase() === c.text.toLowerCase())) return { ok: true, output: "Already remembered." };
  if (existing.length >= MAX_MEMORIES) return { ok: false, output: `Memory is full (${MAX_MEMORIES} facts). Use forget on an outdated one first.` };
  try {
    const rows = (await sql`insert into agent_memory (user_id, text) values (${userId}, ${c.text}) returning id`) as any[];
    return { ok: true, output: `Remembered [${rows[0]?.id}]: ${c.text}` };
  } catch {
    return { ok: false, output: "Memory isn't available right now." };
  }
}

export async function forgetMemory(userId: string, id: unknown): Promise<{ ok: boolean; output: string }> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, output: "Give the numeric id from the memory list." };
  try {
    const rows = (await sql`delete from agent_memory where user_id = ${userId} and id = ${n} returning id`) as any[];
    return rows.length ? { ok: true, output: `Forgot [${n}].` } : { ok: false, output: `No memory with id ${n}.` };
  } catch {
    return { ok: false, output: "Memory isn't available right now." };
  }
}

export async function clearMemories(userId: string): Promise<void> {
  try {
    await sql`delete from agent_memory where user_id = ${userId}`;
  } catch {
    /* table may not exist */
  }
}
