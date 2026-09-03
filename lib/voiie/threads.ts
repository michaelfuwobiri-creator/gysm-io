// Meta Threads API -- search + reply. Broken out from lib/voiie/hunt.ts
// for the same reason lib/voiie/twitter.ts is separate: keeps hunt.ts a
// thin orchestrator instead of an API-client grab-bag.
//
// Setup: Meta for Developers -> Threads API. Keyword/topic search is a
// limited, still-rolling-out surface -- until your app's access includes
// broader search, this degrades gracefully to an empty result set rather
// than throwing, so hunt.ts can still run off Twitter/X alone.

const GRAPH_VERSION = "v20.0";

export interface FoundThreadsPost {
  id: string;
  authorHandle: string;
  text: string;
  createdAt: string;
}

export async function searchThreads(query: string, maxResults = 20): Promise<FoundThreadsPost[]> {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) return [];

  const url = new URL(`https://graph.threads.net/${GRAPH_VERSION}/keyword_search`);
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "id,text,username,timestamp");
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`[voiie/threads] search failed (${res.status}) -- continuing with Twitter/X results only.`);
    return [];
  }

  const json = (await res.json()) as { data?: Array<{ id: string; text: string; username: string; timestamp: string }> };
  return (json.data ?? []).slice(0, maxResults).map((p) => ({
    id: p.id,
    authorHandle: p.username,
    text: p.text,
    createdAt: p.timestamp,
  }));
}

export async function replyToThread(threadId: string, text: string): Promise<void> {
  const token = process.env.THREADS_ACCESS_TOKEN;
  if (!token) throw new Error("THREADS_ACCESS_TOKEN is not configured.");

  const res = await fetch(`https://graph.threads.net/${GRAPH_VERSION}/${threadId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, access_token: token }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Threads reply failed (${res.status}): ${body}`);
  }
}
