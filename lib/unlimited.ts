import { clerkClient } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/isAdmin";

// Accounts that build without spending credits: the GYSM admins
// (lib/isAdmin.ts, michaelfuwobiri@gmail.com by default), matched on a
// VERIFIED email address in Clerk, plus any Clerk user ids listed in
// UNLIMITED_USER_IDS (comma-separated). Looked up once per user per server
// instance for 10 minutes, so this adds no cost to normal requests.

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { unlimited: boolean; at: number }>();

function idsFromEnv(): string[] {
  return (process.env.UNLIMITED_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function isUnlimitedUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (idsFromEnv().includes(userId)) return true;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.unlimited;
  let unlimited = false;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    unlimited = (user.emailAddresses || []).some((e: any) => e?.verification?.status === "verified" && isAdminEmail(e.emailAddress));
  } catch (error: any) {
    // Clerk unreachable: fall back to normal (metered) behaviour, don't cache.
    console.error("[credits] unlimited lookup failed:", error?.message || error);
    return false;
  }
  cache.set(userId, { unlimited, at: Date.now() });
  return unlimited;
}
