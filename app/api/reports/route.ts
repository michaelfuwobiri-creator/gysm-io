import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Report a BuildGuild comment or published build (App Store Guideline 1.2).
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in to report content." }, { status: 401 });

  let kind = "", targetId = "", reason = "";
  try {
    const b = await req.json();
    kind = String(b?.kind ?? "");
    targetId = String(b?.targetId ?? "");
    reason = String(b?.reason ?? "").trim().slice(0, 500);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (kind !== "comment" && kind !== "build") return Response.json({ error: "Invalid report type." }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return Response.json({ error: "Invalid target." }, { status: 400 });

  try {
    const exists =
      kind === "comment"
        ? await sql`select 1 from comments where id = ${targetId} limit 1`
        : await sql`select 1 from projects where id = ${targetId} and is_public = true limit 1`;
    if (exists.length === 0) return Response.json({ error: "Content not found." }, { status: 404 });

    await sql`
      insert into content_reports (reporter_id, kind, target_id, reason)
      values (${user.id}, ${kind}, ${targetId}, ${reason})
    `;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[reports] failed:", error.message);
    return Response.json({ error: "Couldn't submit the report. Please try again." }, { status: 500 });
  }
}
