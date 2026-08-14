import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import BuilderClient from "./BuilderClient";

// Middleware already gates /builder(.*) via Clerk, so getUser() here is
// just for the optional ?projectId= resume lookup below, not a security
// check on its own.
//
// ?projectId=<id> reloads a previously saved build (see app/dashboard) into
// the editor -- preview, code tab, and further edits all pick up right
// where the build left off, instead of the dashboard only being a static
// thumbnail gallery.
export default async function BuilderPage({
  searchParams,
}: {
  searchParams: { projectId?: string };
}) {
  let initialHtml: string | null = null;
  let initialPrompt = "";
  let initialProjectId: string | null = null;

  const projectId = searchParams?.projectId;
  if (projectId) {
    const user = await getUser();
    if (user) {
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
    }
  }

  return (
    <BuilderClient
      initialHtml={initialHtml}
      initialPrompt={initialPrompt}
      initialProjectId={initialProjectId}
    />
  );
}
