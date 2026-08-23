import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getDailyViews, getTopReferrers } from "@/lib/analytics";

// Backs the project/window filters on /dashboard/analytics -- the page
// itself server-renders the default (all builds, 30 days) view; this
// route re-fetches when a user picks a specific build or a different
// window, without a full page reload.
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") || undefined;
  const daysRaw = Number(searchParams.get("days"));
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;

  const ownerId = user.orgId ?? user.id;
  const [daily, referrers] = await Promise.all([
    getDailyViews(ownerId, days, projectId),
    getTopReferrers(ownerId, days, projectId),
  ]);

  return Response.json({ daily, referrers });
}

export const dynamic = "force-dynamic";
