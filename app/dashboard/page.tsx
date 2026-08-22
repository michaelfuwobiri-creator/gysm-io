import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import PromptHero from "./PromptHero";
import TemplatesStrip, { TemplateStripItem } from "./TemplatesStrip";
import AppShell from "../components/AppShell";
import CardMenu from "./CardMenu";
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

  // Curated templates shown in the dashboard's "Start from a template"
  // strip -- same is_template=true rows /templates uses (see
  // app/templates/page.tsx). Best-effort: a failure here shouldn't take
  // down the rest of the dashboard, so it just renders no strip.
  let templates: TemplateStripItem[] = [];
  try {
    templates = (await sql`
      select id, name, prompt, template_blurb as blurb, html from projects
      where is_template = true
      order by created_at desc
      limit 6
    `) as TemplateStripItem[];
  } catch (error: any) {
    console.error("[dashboard] failed to load templates:", error.message);
  }

  // Best-effort first name for the PromptHero greeting -- falls back to
  // null (renders "Ready to build?" with no name) rather than showing a
  // raw email or user id.
  const greetingName = user.name ? user.name.split(" ")[0].split("@")[0] : null;

  return (
    <AppShell active="dashboard">
      <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">{user.orgId ? "Team Builds" : "My Builds"}</h1>
        </div>

        <PromptHero greetingName={greetingName} />

        <TemplatesStrip templates={templates} />

        {list.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider">
              {user.orgId ? "Team builds" : "Your builds"}
            </h2>
            <a href="/builder" className="text-[13px] font-bold text-fuchsia-600 hover:text-fuchsia-700">
              + New build
            </a>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-black/50 p-10 border border-dashed border-black/10 rounded-2xl text-center bg-white">
            {user.orgId
              ? "No team builds yet. Generate one from the prompt box above while this org is active, or ask a teammate to."
              : "No builds yet -- describe what you want above and GYSM.IO will build it."}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((p) => (
              <div key={p.id} className="bg-white border border-black/5 shadow-sm rounded-2xl p-4 flex flex-col gap-3">
                <div className="bg-white rounded-lg h-[180px] overflow-hidden pointer-events-none border border-black/5">
                  <iframe srcDoc={p.html} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title={p.prompt} />
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <RenameButton projectId={p.id} initialName={p.name || p.prompt} />
                    <div className="text-[11px] text-black/40 mt-0.5">
                      {new Date(p.created_at).toLocaleDateString()}
                      {p.is_public && <> • {p.views ?? 0} views</>}
                    </div>
                  </div>
                  <CardMenu>
                    <PublishButton
                      projectId={p.id}
                      initialIsPublic={!!p.is_public}
                      initialTitle={p.title || ""}
                      defaultTitle={p.prompt.slice(0, 80)}
                    />
                    <a
                      href={`/publish/${p.id}/app-stores`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-center px-3 py-2 rounded-lg border border-violet-500/30 text-violet-700 text-xs font-bold hover:bg-violet-50"
                    >
                      Publish to App Store / Play Store
                    </a>
                    <div className="flex gap-2">
                      <DuplicateButton projectId={p.id} />
                      <a
                        href={`/api/projects/${p.id}/download`}
                        className="flex-1 text-center px-3 py-2 rounded-lg border border-black/10 text-xs font-bold hover:bg-black/[0.03]"
                      >
                        Download
                      </a>
                    </div>
                    <div className="pt-1 border-t border-black/10">
                      <DeleteButton projectId={p.id} />
                    </div>
                  </CardMenu>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/builder?projectId=${p.id}`}
                    className="flex-1 text-center px-3 py-2 rounded-lg bg-black text-white text-xs font-bold"
                  >
                    Open in builder
                  </a>
                  <a
                    href={`/publish/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center px-3 py-2 rounded-lg border border-black/10 text-xs font-bold hover:bg-black/[0.03]"
                  >
                    View live
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </AppShell>
  );
}
