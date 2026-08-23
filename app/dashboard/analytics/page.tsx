import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AppShell from "@/app/components/AppShell";
import { getPublishedProjects, getDailyViews, getTopReferrers } from "@/lib/analytics";
import AnalyticsClient from "./AnalyticsClient";

export const metadata = { title: "Analytics | GYSM.IO" };
export const dynamic = "force-dynamic";

// Real per-build analytics -- views over time and top referrers, built
// on project_view_events (db/migrations/0013_view_events.sql). Default
// view is every published build combined over the last 30 days; the
// project picker (client-side) re-fetches through /api/analytics for a
// single build or a different window.
export default async function AnalyticsPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/dashboard/analytics");
  }

  const ownerId = user.orgId ?? user.id;
  const [projects, daily, referrers] = await Promise.all([
    getPublishedProjects(ownerId),
    getDailyViews(ownerId, 30),
    getTopReferrers(ownerId, 30),
  ]);

  return (
    <AppShell active="analytics">
      <AnalyticsClient
        projects={projects}
        initialDaily={daily}
        initialReferrers={referrers}
      />
    </AppShell>
  );
}
