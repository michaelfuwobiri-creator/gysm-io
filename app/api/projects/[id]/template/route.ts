import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";

// Admin-only: flip a build's is_template flag (see db/migrations/0001_init.sql)
// and, optionally, set its curated one-line gallery description
// (db/migrations/0008_template_metadata.sql). Deliberately NOT scoped to
// user_id -- curation is a site-wide editorial action (Mike picking good
// examples across any account), not an owner-only preference. Every other
// /api/projects/[id]/* route stays user_id-scoped as before; this is the
// one exception, and it's gated by isAdminEmail() instead. The display
// *name* shown on a template card reuses the existing `name` column
// (0004_project_extras.sql, PATCH /api/projects/[id]) rather than
// duplicating it here -- name isn't template-specific, blurb is.
// Body: { featured: boolean, blurb?: string }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  let featured: unknown;
  let blurb: string | undefined;
  try {
    const body = await req.json();
    featured = body?.featured;
    if (typeof body?.blurb === "string") {
      blurb = body.blurb.trim().slice(0, 160);
    }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof featured !== "boolean") {
    return Response.json({ error: "featured must be a boolean." }, { status: 400 });
  }

  try {
    const rows =
      blurb !== undefined
        ? await sql`
            update projects
            set is_template = ${featured}, template_blurb = ${blurb || null}
            where id = ${params.id}
            returning id, is_template, template_blurb
          `
        : await sql`
            update projects
            set is_template = ${featured}
            where id = ${params.id}
            returning id, is_template, template_blurb
          `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    // /templates caches this list for 60s via unstable_cache (see
    // app/templates/page.tsx) -- bust it now so a curation change shows
    // up immediately instead of waiting out the window.
    revalidateTag("templates");
    return Response.json({ isTemplate: project.is_template, blurb: project.template_blurb });
  } catch (error: any) {
    console.error("[projects/template] failed to update:", error.message);
    return Response.json({ error: "Failed to update template status." }, { status: 500 });
  }
}

// Admin-only read of current is_template/name/blurb state for a build --
// lets the builder toolbar show the right toggle state and curation
// fields without guessing from the initial page load props.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const rows = await sql`
      select is_template, name, template_blurb from projects where id = ${params.id} limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({
      isTemplate: project.is_template,
      name: project.name,
      blurb: project.template_blurb,
    });
  } catch (error: any) {
    console.error("[projects/template] failed to load:", error.message);
    return Response.json({ error: "Failed to load template status." }, { status: 500 });
  }
}
