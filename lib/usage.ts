import { sql } from "@/lib/db";

// Real, derivable-from-existing-data usage stats for the dashboard.
// Deliberately does NOT include "credits spent over time" -- the credits
// table only tracks a current balance, not a transaction ledger, so a
// real spend-over-time chart would need a new table logging every
// deduct/add event and would only have data from whenever that starts,
// not retroactively. Everything below comes from data that already
// exists today.
export type UsageStats = {
  totalBuilds: number;
  builtThisMonth: number;
  publishedCount: number;
  totalViews: number;
};

export async function getUsageStats(userId: string): Promise<UsageStats> {
  try {
    const rows = await sql`
      select
        count(distinct coalesce(root_project_id, id))::int as total_builds,
        count(distinct coalesce(root_project_id, id)) filter (
          where created_at >= date_trunc('month', now())
        )::int as built_this_month,
        count(*) filter (where is_public = true)::int as published_count,
        coalesce(sum(views) filter (where is_public = true), 0)::int as total_views
      from projects
      where user_id = ${userId}
    `;
    const r = rows[0] as any;
    return {
      totalBuilds: r?.total_builds ?? 0,
      builtThisMonth: r?.built_this_month ?? 0,
      publishedCount: r?.published_count ?? 0,
      totalViews: r?.total_views ?? 0,
    };
  } catch (error: any) {
    console.error("[usage] getUsageStats failed:", error.message);
    return { totalBuilds: 0, builtThisMonth: 0, publishedCount: 0, totalViews: 0 };
  }
}
