import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import AppShell from "@/app/components/AppShell";
import { parseIssues, summarize, type SecurityRow } from "@/lib/securitySummary";
import SecurityClient from "./SecurityClient";

export const metadata = { title: "Security | GYSM" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/settings/security");
  }

  let rows: SecurityRow[] = [];
  let loadFailed = false;
  try {
    // Newest version of each build chain (edits save as new rows).
    const result = await sql`
      select id, coalesce(name, prompt) as label, is_public, check_status, check_results, check_run_at
      from (
        select distinct on (coalesce(root_project_id, id)) *
        from projects
        where (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
          and is_template = false
        order by coalesce(root_project_id, id), created_at desc
      ) latest
      order by created_at desc
      limit 100
    `;
    rows = (result as any[]).map((r) => ({
      id: r.id,
      label: String(r.label ?? "Untitled build").slice(0, 120),
      isPublic: !!r.is_public,
      checkStatus: r.check_status ?? null,
      issues: parseIssues(r.check_results),
      checkedAt: r.check_run_at ? new Date(r.check_run_at).toISOString() : null,
    }));
  } catch (error: any) {
    console.error("[settings/security] failed to load builds:", error.message);
    loadFailed = true;
  }

  const overview = summarize(rows);

  return (
    <AppShell active="security">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Security</h1>
        <p className="text-[13px] text-black/40 mb-8">
          Every build is a public web page that anyone with its link can open and view the source of, so a private key pasted
          into one is public. This page lists what GYSM's automated check found in the newest version of each of your builds:
          exposed keys and tokens first, then quality problems. It is an automated scan, not a security audit, and it cannot
          find every kind of leak.
        </p>
        {loadFailed ? (
          <p className="text-[13px] text-red-600">Could not load your builds. Please refresh and try again.</p>
        ) : (
          <SecurityClient overview={overview} />
        )}
      </div>
    </AppShell>
  );
}
