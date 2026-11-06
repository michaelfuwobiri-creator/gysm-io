// Database access for gysmlink. Degrades to "not ready" if migration 0028 has
// not been applied, so shipping the code first cannot break anything.
import { sql } from "@/lib/db";
import { MAX_LINKS, summarize, type EventRow, type PageStats } from "@/lib/gysmlinkCore";

export * from "@/lib/gysmlinkCore";

export const GYSMLINK_NOT_READY = "gysmlink isn't enabled on this deployment yet (database migration 0028 has not been applied).";

export type Page = { id: string; user_id: string; handle: string; display_name: string; bio: string; theme: string; published: boolean };
export type Link = { id: string; page_id: string; title: string; url: string; position: number; active: boolean };

export async function gysmlinkReady(): Promise<boolean> {
  try {
    await sql`select 1 as x from gysmlink_pages limit 1`;
    await sql`select 1 as x from gysmlink_links limit 1`;
    await sql`select 1 as x from gysmlink_events limit 1`;
    return true;
  } catch {
    return false;
  }
}

export async function getPageForUser(userId: string): Promise<Page | null> {
  const rows = (await sql`select * from gysmlink_pages where user_id = ${userId} limit 1`) as Page[];
  return rows[0] ?? null;
}

export async function getPublishedPage(handle: string): Promise<{ page: Page; links: Link[] } | null> {
  const rows = (await sql`select * from gysmlink_pages where handle = ${handle} and published = true limit 1`) as Page[];
  const page = rows[0];
  if (!page) return null;
  const links = (await sql`
    select * from gysmlink_links where page_id = ${page.id} and active = true order by position asc, created_at asc
  `) as Link[];
  return { page, links };
}

export async function listLinks(pageId: string): Promise<Link[]> {
  return (await sql`select * from gysmlink_links where page_id = ${pageId} order by position asc, created_at asc`) as Link[];
}

export async function countLinks(pageId: string): Promise<number> {
  const rows = (await sql`select count(*)::int as n from gysmlink_links where page_id = ${pageId}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** A link, only if it belongs to this user's page. */
export async function getOwnedLink(linkId: string, userId: string): Promise<Link | null> {
  if (!/^[0-9a-f-]{36}$/i.test(linkId)) return null;
  const rows = (await sql`
    select l.* from gysmlink_links l join gysmlink_pages p on p.id = l.page_id
    where l.id = ${linkId} and p.user_id = ${userId} limit 1
  `) as Link[];
  return rows[0] ?? null;
}

export async function recordEvent(e: { pageId: string; linkId: string | null; kind: "view" | "click"; referrer: string; device: string }) {
  try {
    await sql`
      insert into gysmlink_events (page_id, link_id, kind, referrer, device)
      values (${e.pageId}, ${e.linkId}, ${e.kind}, ${e.referrer}, ${e.device})
    `;
  } catch (err: any) {
    console.error("[gysmlink] failed to record event:", err.message);
  }
}

export async function getStats(pageId: string, links: Link[], days = 30): Promise<PageStats> {
  const rows = (await sql`
    select kind, link_id, referrer, device from gysmlink_events
    where page_id = ${pageId} and at > now() - ${days} * interval '1 day'
    order by at desc limit 20000
  `) as EventRow[];
  return summarize(rows, links.map((l) => l.id));
}

export { MAX_LINKS };
