import { sql } from "@/lib/db";

// Real per-build analytics from project_view_events (db/migrations/
// 0013_view_events.sql) -- every row is one actual page load of one of
// this user's published builds, logged in app/publish/[id]/page.tsx.
// Nothing here is estimated or sampled.

export type DailyViews = { date: string; count: number };
export type ReferrerCount = { referrer: string; count: number };

export type ProjectOption = { id: string; title: string; views: number };

/** Every published build this user/org owns, newest first -- for the
 *  project picker. Not paginated; a user with hundreds of published
 *  builds is not the common case this needs to handle yet. */
export async function getPublishedProjects(ownerId: string): Promise<ProjectOption[]> {
  try {
    const rows = await sql`
      select id, coalesce(title, left(prompt, 60)) as title, views
      from projects
      where (user_id = ${ownerId} or org_id = ${ownerId}) and is_public = true
      order by created_at desc
    `;
    return (rows as any[]).map((r) => ({ id: r.id, title: r.title || "Untitled build", views: r.views ?? 0 }));
  } catch (error: any) {
    console.error("[analytics] getPublishedProjects failed:", error.message);
    return [];
  }
}

/** Daily view counts for the last N days, for one project if projectId is
 *  given, or summed across every published build the owner has otherwise.
 *  Always returns one entry per day (zero-filled), oldest first, so the
 *  bar chart doesn't have to know how to handle gaps. */
export async function getDailyViews(ownerId: string, days: number, projectId?: string): Promise<DailyViews[]> {
  try {
    const rows = projectId
      ? await sql`
          select date_trunc('day', viewed_at)::date as day, count(*)::int as count
          from project_view_events e
          join projects p on p.id = e.project_id
          where e.project_id = ${projectId}
            and (p.user_id = ${ownerId} or p.org_id = ${ownerId})
            and e.viewed_at >= now() - (${days} || ' days')::interval
          group by 1
        `
      : await sql`
          select date_trunc('day', viewed_at)::date as day, count(*)::int as count
          from project_view_events e
          join projects p on p.id = e.project_id
          where (p.user_id = ${ownerId} or p.org_id = ${ownerId})
            and e.viewed_at >= now() - (${days} || ' days')::interval
          group by 1
        `;
    const byDay = new Map<string, number>();
    for (const r of rows as any[]) {
      byDay.set(new Date(r.day).toISOString().slice(0, 10), r.count);
    }
    const out: DailyViews[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, count: byDay.get(key) ?? 0 });
    }
    return out;
  } catch (error: any) {
    console.error("[analytics] getDailyViews failed:", error.message);
    return [];
  }
}

/** Top referring hosts (Referer header, host portion only -- full URLs
 *  with query strings would just fragment the same source into a dozen
 *  rows) over the last N days. "Direct / unknown" covers requests with no
 *  Referer header at all (typed URL, most native apps, some browsers). */
export async function getTopReferrers(ownerId: string, days: number, projectId?: string): Promise<ReferrerCount[]> {
  try {
    const rows = projectId
      ? await sql`
          select referrer, count(*)::int as count
          from project_view_events e
          join projects p on p.id = e.project_id
          where e.project_id = ${projectId}
            and (p.user_id = ${ownerId} or p.org_id = ${ownerId})
            and e.viewed_at >= now() - (${days} || ' days')::interval
          group by referrer
        `
      : await sql`
          select referrer, count(*)::int as count
          from project_view_events e
          join projects p on p.id = e.project_id
          where (p.user_id = ${ownerId} or p.org_id = ${ownerId})
            and e.viewed_at >= now() - (${days} || ' days')::interval
          group by referrer
        `;
    const byHost = new Map<string, number>();
    for (const r of rows as any[]) {
      let host = "Direct / unknown";
      if (r.referrer) {
        try {
          host = new URL(r.referrer).hostname.replace(/^www\./, "");
        } catch {
          host = "Direct / unknown";
        }
      }
      byHost.set(host, (byHost.get(host) ?? 0) + r.count);
    }
    return Array.from(byHost.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  } catch (error: any) {
    console.error("[analytics] getTopReferrers failed:", error.message);
    return [];
  }
}
