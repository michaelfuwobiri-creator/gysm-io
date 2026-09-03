import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { huntClients, DEFAULT_HUNT_QUERY } from "@/lib/voiie/hunt";

/** "Hunt Now" button -- runs synchronously (no queue in this app), so it's
 *  bounded by the same request budget app/api/generate/route.ts uses.
 *  Three network searches (Twitter + Threads + Places) comfortably fit
 *  well under that. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let query = DEFAULT_HUNT_QUERY;
  let placesQuery: string | undefined;
  let platforms: ("twitter" | "threads" | "places")[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.query === "string" && body.query.trim()) query = body.query.trim();
    if (typeof body?.placesQuery === "string" && body.placesQuery.trim()) placesQuery = body.placesQuery.trim();
    if (Array.isArray(body?.platforms)) {
      platforms = body.platforms.filter((p: unknown) => p === "twitter" || p === "threads" || p === "places");
    }
  } catch {
    // no body -- use defaults
  }

  try {
    const result = await huntClients({ ownerUserId: user.id, query, placesQuery, platforms });
    return Response.json(result);
  } catch (error: any) {
    console.error("[voiie/hunt] failed:", error.message);
    return Response.json({ error: "Hunt failed. Check your Twitter/Threads/Places API credentials." }, { status: 500 });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";
