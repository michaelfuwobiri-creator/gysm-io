import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import BuilderClient from "./BuilderClient";

// Middleware already gates /builder(.*) via Clerk, so getUser() here is
// just for the optional ?projectId=/?template= resume lookups below and
// the isAdmin flag, not a security check on its own.
//
// ?projectId=<id> reloads a previously saved build (see app/dashboard) into
// the editor -- preview, code tab, and further edits all pick up right
// where the build left off, instead of the dashboard only being a static
// thumbnail gallery.
//
// ?template=<id> (see app/templates) loads a curated is_template=true
// build's html/prompt as a *starting point* for a brand new build --
// deliberately does NOT set initialProjectId, so the first save/edit
// creates a fresh project owned by whoever clicked "Use this template"
// instead of overwriting the shared template row. Lookup is intentionally
// not scoped to user_id: templates are curated site-wide (see
// app/api/projects/[id]/template), not personal builds.
export default async function BuilderPage({
  searchParams,
}: {
  searchParams: { projectId?: string; template?: string };
}) {
  let initialHtml: string | null = null;
  let initialPrompt = "";
  let initialProjectId: string | null = null;

  const user = await getUser();
  const isAdmin = isAdminEmail(user?.email ?? null);

  const projectId = searchParams?.projectId;
  const templateId = searchParams?.template;

  if (projectId && user) {
    try {
      const rows = await sql`
        select id, prompt, html from projects
        where id = ${projectId} and user_id = ${user.id}
        limit 1
      `;
      const project = rows[0] as any;
      if (project) {
        initialHtml = project.html;
        initialPrompt = project.prompt;
        initialProjectId = project.id;
      }
    } catch (error: any) {
      console.error("[builder] failed to load project for resume:", error.message);
    }
  } else if (templateId) {
    try {
      const rows = await sql`
        select id, prompt, html from projects
        where id = ${templateId} and is_template = true
        limit 1
      `;
      const template = rows[0] as any;
      if (template) {
        initialHtml = template.html;
        initialPrompt = template.prompt;
        // initialProjectId intentionally left null -- see comment above.
      }
    } catch (error: any) {
      console.error("[builder] failed to load template:", error.message);
    }
  }

  return (
    <BuilderClient
      initialHtml={initialHtml}
      initialPrompt={initialPrompt}
      initialProjectId={initialProjectId}
      isAdmin={isAdmin}
    />
  );
}
