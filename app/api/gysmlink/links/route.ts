import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { GYSMLINK_NOT_READY, MAX_LINKS, MAX_TITLE, cleanText, countLinks, getPageForUser, gysmlinkReady, safeUrl } from "@/lib/gysmlink";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const title = cleanText(body?.title, MAX_TITLE);
  const url = safeUrl(body?.url);
  if (!title) return Response.json({ error: "Give the link a title." }, { status: 400 });
  if (!url) return Response.json({ error: "Enter a valid web address (http/https), email or phone link." }, { status: 400 });

  try {
    if (!(await gysmlinkReady())) return Response.json({ error: GYSMLINK_NOT_READY }, { status: 409 });
    const page = await getPageForUser(user.id);
    if (!page) return Response.json({ error: "Create your page first." }, { status: 400 });
    if ((await countLinks(page.id)) >= MAX_LINKS) {
      return Response.json({ error: `You can have up to ${MAX_LINKS} links.` }, { status: 400 });
    }
    const rows = await sql`
      insert into gysmlink_links (page_id, title, url, position)
      values (${page.id}, ${title}, ${url}, (select coalesce(max(position), -1) + 1 from gysmlink_links where page_id = ${page.id}))
      returning *
    `;
    return Response.json({ link: rows[0] });
  } catch (error: any) {
    console.error("[gysmlink] add link failed:", error.message);
    return Response.json({ error: "Failed to add the link." }, { status: 500 });
  }
}
