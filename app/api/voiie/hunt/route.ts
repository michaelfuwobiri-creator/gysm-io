import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { huntClients, DEFAULT_HUNT_QUERY } from "@/lib/voiie/hunt";

/** "Hunt Now" button -- runs synchronously (no queue in this app), so it's
 *  bounded by the same request budget app/api/generate/route.ts uses. Two
 *  network searches (Twitter + Threads) comfortably fit well under that. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let query = DEFAULT_HUNT_QUERY;
  let platforms: ("twitter" | "threads")[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.query === "string" && body.query.trim()) query = body.query.trim();
    if (Array.isArray(body?.platforms)) platforms = body.platforms.filter((p: unknown) => p === "twitter" || p === "threads");
  } catch {
    // no body -- use defaults
  }

  try {
    const result = await huntClients({ ownerUserId: user.id, query, platforms });
    return Response.json(result);
  } catch (error: any) {
    console.error("[voiie/hunt] failed:", error.message);
    return Response.json({ error: "Hunt failed. Check your Twitter/Threads API credentials." }, { status: 500 });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";
