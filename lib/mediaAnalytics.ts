import { sql } from "@/lib/db";

// Media Factory usage analytics (42-tool spec, layer 7, item 42: "how
// many gens, MRR from videos, views"). Real aggregates from
// media_generations only -- no fabricated MRR figure here, since credit
// cost isn't the same thing as revenue (a credit's $ value depends on
// which plan the user bought it under, tracked in lib/stripe.ts, not on
// this table) and "views" for a private generation isn't a meaningful
// concept the way it is for a published BuildGuild app or a Flow TV
// gallery item.

export interface MediaKindUsage {
  kind: string;
  count: number;
  credits: number;
}

export interface MediaUsageSummary {
  totalGenerations: number;
  totalCreditsSpent: number;
  totalFailed: number;
  last30DaysCount: number;
  byKind: MediaKindUsage[];
}

export async function getMediaUsageSummary(userId: string): Promise<MediaUsageSummary> {
  const [totals, byKind, recent] = await Promise.all([
    sql`
      select
        count(*)::int as total,
        coalesce(sum(credit_cost) filter (where status = 'done'), 0)::int as spent,
        count(*) filter (where status = 'failed')::int as failed
      from media_generations
      where user_id = ${userId}
    `,
    sql`
      select kind, count(*)::int as count, coalesce(sum(credit_cost) filter (where status = 'done'), 0)::int as credits
      from media_generations
      where user_id = ${userId}
      group by kind
      order by count desc
    `,
    sql`
      select count(*)::int as count
      from media_generations
      where user_id = ${userId} and created_at > now() - interval '30 days'
    `,
  ]);

  const t = (totals[0] as any) || { total: 0, spent: 0, failed: 0 };
  return {
    totalGenerations: t.total,
    totalCreditsSpent: t.spent,
    totalFailed: t.failed,
    last30DaysCount: (recent[0] as any)?.count || 0,
    byKind: (byKind as any[]).map((r) => ({ kind: r.kind, count: r.count, credits: r.credits })),
  };
}
