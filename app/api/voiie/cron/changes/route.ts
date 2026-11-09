import { NextRequest } from "next/server";
import { processPendingChanges } from "@/lib/voiie/changes";

/** Applies pending website-change requests from leads (VOIIE_AUTOCHANGE=1).
 *  Called every ~10 minutes by .github/workflows/voiie-changes.yml with the
 *  CRON_SECRET bearer, same as the other cron routes. */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const owner = process.env.VOIIE_OWNER_USER_ID;
  if (!owner) return Response.json({ ok: false, error: "VOIIE_OWNER_USER_ID not configured" }, { status: 500 });
  const r = await processPendingChanges(owner, 2);
  return Response.json({ ok: true, ...r });
}

export const maxDuration = 240;
export const dynamic = "force-dynamic";
