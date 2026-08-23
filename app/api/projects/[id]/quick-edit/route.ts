import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { runPreflightCheck } from "@/lib/preflightCheck";

// "Quick edit" -- saves a direct in-preview edit (inline text edit or a
// color swatch change made via the click-to-edit overlay in
// BuilderClient) back onto the CURRENT project row, in place. This is
// deliberately different from a normal AI edit (app/api/generate/route.ts),
// which always creates a new version row for the builder's History panel
// -- a one-word copy fix or a color tweak isn't a new "version" worth
// cluttering that list with, it's a correction to the version you're
// already looking at. Re-runs the same automated pre-publish check a
// fresh generation gets, since a manual DOM edit can just as easily
// introduce a broken anchor or an unbalanced tag as an AI edit can.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let html = "";
  try {
    const body = await req.json();
    html = typeof body?.html === "string" ? body.html : "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!html || !html.trim()) {
    return Response.json({ error: "No content to save." }, { status: 400 });
  }
  // Same rough ceiling as a normal generated build -- a quick edit is a
  // small mutation of existing HTML, not a way around any size limits
  // that would otherwise apply.
  if (html.length > 2_000_000) {
    return Response.json({ error: "That build is too large to save." }, { status: 400 });
  }

  const normalized = /^<!DOCTYPE html>/i.test(html.trim()) ? html : `<!DOCTYPE html>\n${html}`;
  const preflight = runPreflightCheck(normalized);

  try {
    const rows = await sql`
      update projects
      set html = ${normalized}, check_status = ${preflight.status}, check_results = ${JSON.stringify(preflight.issues)}, check_run_at = ${preflight.checkedAt}
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      returning id
    `;
    if (!rows[0]) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
  } catch (error: any) {
    console.error("[quick-edit] failed to save:", error.message);
    return Response.json({ error: "Failed to save your edit. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true, checkStatus: preflight.status, issues: preflight.issues });
}
