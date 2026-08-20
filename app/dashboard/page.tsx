import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import PublishButton from "./PublishButton";
import DeleteButton from "./DeleteButton";
import RenameButton from "./RenameButton";
import DuplicateButton from "./DuplicateButton";

// Reads straight from Neon. Every project generated through /api/generate
// is saved there, keyed by the Clerk user id (see lib/auth.ts and
// db/migrations/0001_init.sql). A stale foreign key on projects.user_id
// (left over from an earlier schema, pointed at the wrong column) was
// silently failing every save until it was dropped -- this list should now
// actually fill up as builds happen.
//
// Only root builds show up here (root_project_id is null) -- an edit made
// via a suggestion chip in the builder saves as a new row chained to its
// root (see db/migrations/0004 and app/api/generate/route.ts), and shows
// up in that build's History panel instead of as a separate dashboard
// card.
export default async function DashboardPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/dashboard");
  }

  // When the user has an org selected in the OrganizationSwitcher below,
  // this shows that team's builds instead of their personal ones -- same
  // switch-to-see-a-different-workspace behavior as any Clerk Orgs app.
  // Switching back to "Personal account" shows exactly what this page
  // always showed before teams existed.
  let list: any[] = [];
  try {
    list = user.orgId
      ? await sql`
          select id, prompt, html, created_at, is_public, title, name, views from projects
          where org_id = ${user.orgId} and root_project_id is null
          order by created_at desc
          limit 50
        `
      : await sql`
          select id, prompt, html, created_at, is_public, title, name, views from projects
          where user_id = ${user.id} and org_id is null and root_project_id is null
          order by created_at desc
          limit 50
        `;
  } catch (error: any) {
    console.error("[dashboard] failed to load projects:", error.message);
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{user.orgId ? "Team Builds" : "My Builds"}</h1>
          <div className="flex items-center gap-4">
            <OrganizationSwitcher
              afterCreateOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              afterSelectPersonalUrl="/dashboard"
              afterLeaveOrganizationUrl="/dashboard"
              appearance={{ elements: { organizationSwitcherTrigger: "text-white" } }}
            />
            <a href="/buildguild" className="px-4 py-2 border border-white/15 rounded-lg font-semibold">
              BuildGuild
            </a>
            <a href="/builder" className="px-4 py-2 bg-white text-black rounded-lg font-semibold">
              + New Build
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {list.length === 0 ? (
          <div className="text-white/50 p-8 border border-dashed border-white/10 rounded-xl text-center">
            {user.orgId
              ? "No team builds yet. Generate one from the builder while this org is active, or ask a teammate to."
              : "No builds yet. Head to the builder and generate your first one."}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((p) => (
              <div key={p.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs text-white/40 flex items-center justify-between gap-2">
                  <span>{new Date(p.created_at).toLocaleString()} • {String(p.id).slice(0, 8)}</span>
                  {p.is_public && <span>{p.views ?? 0} views</span>}
                </div>
                <RenameButton projectId={p.id} initialName={p.name || p.prompt} />
                <div className="bg-white rounded-lg h-[200px] overflow-hidden pointer-events-none">
                  <iframe srcDoc={p.html} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title={p.prompt} />
                </div>
                <div className="flex gap-2">
                  <a
                    href={`/builder?projectId=${p.id}`}
                    className="flex-1 text-center px-3 py-2 rounded-lg bg-white text-black text-xs font-bold"
                  >
                    Open in builder
                  </a>
                  <a
                    href={`/publish/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center px-3 py-2 rounded-lg border border-white/15 text-xs font-bold"
                  >
                    View live
                  </a>
                </div>
                <a
                  href={`/publish/${p.id}/app-stores`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-center px-3 py-2 rounded-lg border border-violet-500/30 text-violet-400 text-xs font-bold hover:bg-violet-500/10"
                >
                  Publish to App Store / Play Store
                </a>
                <PublishButton
                  projectId={p.id}
                  initialIsPublic={!!p.is_public}
                  initialTitle={p.title || ""}
                  defaultTitle={p.prompt.slice(0, 80)}
                />
                <div className="flex gap-2">
                  <DuplicateButton projectId={p.id} />
                  <a
                    href={`/api/projects/${p.id}/download`}
                    className="flex-1 text-center px-3 py-2 rounded-lg border border-white/15 text-xs font-bold hover:bg-white/5"
                  >
                    Download
                  </a>
                </div>
                <DeleteButton projectId={p.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
