import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { runPreflightCheck } from "@/lib/preflightCheck";

// Re-runs the automated check (quality + exposed-secret scan) on the newest
// version of each of the user's builds, and stores the result. Needed for
// builds saved before the secret scan existed. Bounded to the 50 most
// recent builds per call so one request stays fast.
export const maxDuration = 60;
const MAX_BUILDS = 50;

export async function POST() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const rows = await sql`
      select id, html from (
        select distinct on (coalesce(root_project_id, id)) id, html, created_at
        from projects
        where (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
          and is_template = false
        order by coalesce(root_project_id, id), created_at desc
      ) latest
      order by created_at desc
      limit ${MAX_BUILDS}
    `;

    let withSecrets = 0;
    for (const row of rows as any[]) {
      const preflight = runPreflightCheck(String(row.html ?? ""));
      if (preflight.issues.some((i) => i.type === "exposed_secret")) withSecrets += 1;
      await sql`
        update projects
        set check_status = ${preflight.status}, check_results = ${JSON.stringify(preflight.issues)}, check_run_at = ${preflight.checkedAt}
        where id = ${row.id}
      `;
    }
    return Response.json({ ok: true, scanned: rows.length, withSecrets });
  } catch (error: any) {
    console.error("[security scan] failed:", error.message);
    return Response.json({ error: "Scan failed. Please try again." }, { status: 500 });
  }
}
