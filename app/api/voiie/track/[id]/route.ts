import { NextRequest } from "next/server";
import { getLeadUnscoped, markDemoViewed } from "@/lib/voiie/db";

/**
 * GET /api/voiie/track/[id]?to=<publish-url>
 *
 * The link actually sent to a prospect over WhatsApp/Twitter/email isn't
 * the raw /publish/[projectId] URL -- it's this one, wrapping it. Visiting
 * it marks the lead's demo as viewed (demo_sent -> viewed, see
 * markDemoViewed in lib/voiie/db.ts) and immediately 302s through to the
 * real demo.
 *
 * Deliberately doesn't touch app/publish/[id]/page.tsx (gysm-io's shared,
 * generic public-project page used by every user's build, not just
 * VOIIE's) -- a tracking pixel embedded there would fire for every
 * gysm.io user's published project, not just demos VOIIE sent out. A
 * redirect wrapper on VOIIE's own link keeps that shared page untouched.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const to = req.nextUrl.searchParams.get("to");
  const fallback = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const destination = to && to.startsWith(fallback) ? to : fallback;

  try {
    const lead = await getLeadUnscoped(params.id);
    if (lead) await markDemoViewed(params.id);
  } catch (err) {
    console.warn("[voiie/track] failed to mark demo viewed:", (err as Error).message);
  }

  return Response.redirect(destination, 302);
}

export const dynamic = "force-dynamic";
