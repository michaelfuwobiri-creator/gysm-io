import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  GYSMLINK_NOT_READY,
  MAX_BIO,
  MAX_NAME,
  cleanText,
  getPageForUser,
  getStats,
  gysmlinkReady,
  isTheme,
  listLinks,
  normalizeHandle,
} from "@/lib/gysmlink";

// Your gysmlink page: read it (with links and 30-day stats) or create/update it.

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    if (!(await gysmlinkReady())) return Response.json({ ready: false, message: GYSMLINK_NOT_READY });
    const page = await getPageForUser(user.id);
    if (!page) return Response.json({ ready: true, page: null, links: [], stats: null });
    const links = await listLinks(page.id);
    const stats = await getStats(page.id, links);
    return Response.json({ ready: true, page, links, stats });
  } catch (error: any) {
    console.error("[gysmlink] load failed:", error.message);
    return Response.json({ error: "Failed to load your page." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const handle = normalizeHandle(body?.handle);
  if (!handle) {
    return Response.json({ error: "Handle must be 2-30 letters, numbers, - or _, and not a reserved word." }, { status: 400 });
  }
  const displayName = cleanText(body?.display_name, MAX_NAME);
  const bio = cleanText(body?.bio, MAX_BIO);
  const theme = isTheme(body?.theme) ? body.theme : "midnight";
  const published = body?.published !== false;

  try {
    if (!(await gysmlinkReady())) return Response.json({ error: GYSMLINK_NOT_READY }, { status: 409 });
    const taken = (await sql`select user_id from gysmlink_pages where handle = ${handle} limit 1`) as { user_id: string }[];
    if (taken[0] && taken[0].user_id !== user.id) {
      return Response.json({ error: "That handle is taken. Try another." }, { status: 409 });
    }
    const rows = await sql`
      insert into gysmlink_pages (user_id, handle, display_name, bio, theme, published)
      values (${user.id}, ${handle}, ${displayName}, ${bio}, ${theme}, ${published})
      on conflict (user_id) do update
        set handle = excluded.handle, display_name = excluded.display_name, bio = excluded.bio,
            theme = excluded.theme, published = excluded.published, updated_at = now()
      returning *
    `;
    return Response.json({ page: rows[0] });
  } catch (error: any) {
    // Unique violation from a race on the handle.
    if (/duplicate key|unique/i.test(error.message || "")) {
      return Response.json({ error: "That handle is taken. Try another." }, { status: 409 });
    }
    console.error("[gysmlink] save failed:", error.message);
    return Response.json({ error: "Failed to save your page." }, { status: 500 });
  }
}
