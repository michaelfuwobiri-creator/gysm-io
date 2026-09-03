// Thin fetch wrapper for the VOIIE dashboard's calls into /api/voiie/*.
// Those routes don't share one uniform envelope (see the routes
// themselves) -- some return { error } on failure and the requested data
// directly on success, so this only standardizes the failure path; call
// sites destructure the specific fields they need from a successful
// response.

export class ApiError extends Error {}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "GET" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? `Request to ${path} failed (${res.status})`);
  return json as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error ?? `Request to ${path} failed (${res.status})`);
  return json as T;
}
