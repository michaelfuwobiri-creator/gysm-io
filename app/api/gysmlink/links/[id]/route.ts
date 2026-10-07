import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { MAX_TITLE, cleanText, getOwnedLink, listLinks, safeUrl } from "@/lib/gysmlink";

// Edit, hide/show, reorder (move up/down) or delete one of your links.

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  try {
    const link = await getOwnedLink(params.id, user.id);
    if (!link) return Response.json({ error: "Link not found." }, { status: 404 });

    if (body?.move === "up" || body?.move === "down") {
      const all = await listLinks(link.page_id);
      const i = all.findIndex((l) => l.id === link.id);
      const j = body.move === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < all.length) {
        // Renumber the whole list so positions are always distinct.
        const order = all.map((l) => l.id);
        [order[i], order[j]] = [order[j], order[i]];
        for (let p = 0; p < order.length; p++) {
          await sql`update gysmlink_links set position = ${p} where id = ${order[p]} and page_id = ${link.page_id}`;
        }
      }
      return Response.json({ links: await listLinks(link.page_id) });
    }

    const title = body?.title !== undefined ? cleanText(body.title, MAX_TITLE) : link.title;
    const url = body?.url !== undefined ? safeUrl(body.url) : link.url;
    const active = typeof body?.active === "boolean" ? body.active : link.active;
    if (!title) return Response.json({ error: "Give the link a title." }, { status: 400 });
    if (!url) return Response.json({ error: "Enter a valid web address (http/https), email or phone link." }, { status: 400 });
    const rows = await sql`
      update gysmlink_links set title = ${title}, url = ${url}, active = ${active} where id = ${link.id} returning *
    `;
    return Response.json({ link: rows[0] });
  } catch (error: any) {
    console.error("[gysmlink] update link failed:", error.message);
    return Response.json({ error: "Failed to update the link." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const link = await getOwnedLink(params.id, user.id);
    if (!link) return Response.json({ error: "Link not found." }, { status: 404 });
    await sql`delete from gysmlink_links where id = ${link.id}`;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[gysmlink] delete link failed:", error.message);
    return Response.json({ error: "Failed to delete the link." }, { status: 500 });
  }
}
