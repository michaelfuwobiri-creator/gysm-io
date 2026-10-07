import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { deviceOf, isBot, recordEvent, referrerHost, safeUrl } from "@/lib/gysmlink";

export const dynamic = "force-dynamic";

// Counts a click on a gysmlink link, then sends the visitor on. The stored
// destination is re-validated here too, so a bad row can never redirect to a
// javascript:/data: URL.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
  try {
    const rows = (await sql`
      select l.id, l.url, l.page_id from gysmlink_links l join gysmlink_pages p on p.id = l.page_id
      where l.id = ${params.id} and l.active = true and p.published = true limit 1
    `) as { id: string; url: string; page_id: string }[];
    const link = rows[0];
    const dest = link ? safeUrl(link.url) : null;
    if (!link || !dest) return new Response("Not found", { status: 404 });

    const ua = req.headers.get("user-agent");
    if (!isBot(ua)) {
      await recordEvent({
        pageId: link.page_id,
        linkId: link.id,
        kind: "click",
        referrer: referrerHost(req.headers.get("referer")),
        device: deviceOf(ua),
      });
    }
    return new Response(null, {
      status: 302,
      headers: { Location: dest, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
    });
  } catch (error: any) {
    console.error("[gysmlink] redirect failed:", error.message);
    return new Response("Not found", { status: 404 });
  }
}
