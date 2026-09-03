import { NextRequest } from "next/server";
import { huntClients } from "@/lib/voiie/hunt";

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

  try {
    const result = await huntClients({ ownerUserId });
    return Response.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("[voiie/cron/hunt] sweep failed:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60;
export const dynamic = "force-dynamic";
