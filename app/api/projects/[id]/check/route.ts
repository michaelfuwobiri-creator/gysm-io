import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { runPreflightCheck } from "@/lib/preflightCheck";

// On-demand re-run of the automated pre-publish check (lib/preflightCheck.ts)
// -- used for builds saved before this feature existed (check_status is
// null) and after a quick edit or connector sync changes a build's HTML
// outside the normal generate/edit path.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select html from projects
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const preflight = runPreflightCheck(project.html);
    await sql`
      update projects
      set check_status = ${preflight.status}, check_results = ${JSON.stringify(preflight.issues)}, check_run_at = ${preflight.checkedAt}
      where id = ${params.id}
    `;

    return Response.json({ ok: true, checkStatus: preflight.status, issues: preflight.issues });
  } catch (error: any) {
    console.error("[check] failed:", error.message);
    return Response.json({ error: "Check failed. Please try again." }, { status: 500 });
  }
}
