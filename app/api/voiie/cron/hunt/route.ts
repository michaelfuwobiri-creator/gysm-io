import { NextRequest } from "next/server";
import { huntClients } from "@/lib/voiie/hunt";
import { queriesFromSlot } from "@/lib/voiie/hunt-rotation";
import { sendFirstTouchesNow } from "@/lib/voiie/autosend";
import type { Platform } from "@/types/voiie";

/** Vercel Cron hits this on a schedule (see vercel.json). Vercel signs
 *  cron requests with an `Authorization: Bearer ${CRON_SECRET}` header
 *  automatically -- see https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *  Single-operator today (see VOIIE_OWNER_USER_ID -- same variable the
 *  inbound webhooks use to know whose lead list to write into). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ownerUserId = process.env.VOIIE_OWNER_USER_ID;
  if (!ownerUserId) {
    console.error("[voiie/cron/hunt] VOIIE_OWNER_USER_ID is not configured");
    return Response.json({ ok: false, error: "VOIIE_OWNER_USER_ID not configured" }, { status: 500 });
  }

  console.log("[voiie/cron/hunt] run started", { rotate: process.env.VOIIE_HUNT_ROTATE === "1", at: new Date().toISOString() });
  try {
    // VOIIE_PLACES_QUERY (e.g. "plumbers in Austin, TX") is optional --
    // unset, this sweep just runs Twitter/Threads same as before. Set it
    // to also fold Google Places' no-website-on-file businesses into the
    // daily unattended sweep, same as the dashboard's Hunt Now can.
    const placesQuery = process.env.VOIIE_PLACES_QUERY || undefined;
    const social = process.env.VOIIE_SOCIAL_HUNT === "1";
    const platforms: Platform[] = placesQuery ? (social ? ["twitter", "threads", "places"] : ["places"]) : social ? ["twitter", "threads"] : [];
    // VOIIE_HUNT_ROTATE=1: instead of one fixed query, sweep the next few
    // "trade in town" searches from the rotation list, email-only (leads that
    // publish a public address on a weak site -- the only ones we can email).
    // Hit hourly by .github/workflows/voiie-hunt.yml; each slot advances with
    // the clock so successive runs search new places. The daily lead cap and
    // kill switch still stop it inside huntClients.
    if (process.env.VOIIE_HUNT_ROTATE === "1") {
      const perRun = Math.min(6, Math.max(1, parseInt(process.env.VOIIE_HUNT_QUERIES_PER_RUN || "3", 10) || 3));
      const hourSlot = Math.floor(Date.now() / 3_600_000);
      const queries = queriesFromSlot(hourSlot * perRun, perRun);
      const runs = [];
      let created = 0;
      for (const q of queries) {
        try {
          const r = await huntClients({ ownerUserId, placesQuery: q, platforms: ["places"], emailOnly: true });
          created += r.newLeadsCreated;
          runs.push({ q, created: r.newLeadsCreated, skipped: r.skippedReason ?? null });
          if (r.skippedReason) break; // kill switch or daily cap: stop this run
        } catch (e: any) {
          runs.push({ q, error: e.message });
        }
      }
      // Message the new leads right away (and any left over from quiet hours),
      // inside the autopilot's own guards; see lib/voiie/autosend.ts.
      const firstTouch = await sendFirstTouchesNow(ownerUserId);
      console.log("[voiie/cron/hunt] run done", { created, firstTouchSent: firstTouch.sent, firstTouchSkipped: firstTouch.skipped, errors: firstTouch.errors.length });
      return Response.json({ ok: true, rotate: true, created, runs, firstTouch });
    }
    const result = await huntClients({ ownerUserId, placesQuery, platforms });
    return Response.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("[voiie/cron/hunt] sweep failed:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";
