import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { storesEnabled } from "./core";
import { getStoreForUser, type StoreRow } from "./db";

type User = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/** 404 while the feature flag is off, so nothing about stores is reachable. */
export function storesOff(): NextResponse | null {
  return storesEnabled() ? null : json({ error: "Not found" }, 404);
}

export async function requireSeller(): Promise<{ user: User } | { error: NextResponse }> {
  const off = storesOff();
  if (off) return { error: off };
  const user = await getUser();
  if (!user) return { error: json({ error: "Sign in first." }, 401) };
  return { user };
}

/** The signed-in seller and their store, or the response to send instead. */
export async function requireOwnedStore(id: string): Promise<{ user: User; store: StoreRow } | { error: NextResponse }> {
  const r = await requireSeller();
  if ("error" in r) return r;
  const store = await getStoreForUser(id, r.user.id);
  if (!store) return { error: json({ error: "Store not found." }, 404) };
  return { user: r.user, store };
}

export async function readJson(req: Request): Promise<any | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
