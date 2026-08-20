import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";

// Admin-only: flip a build's is_template flag (see db/migrations/0001_init.sql).
// Deliberately NOT scoped to user_id -- curation is a site-wide editorial
// action (Mike picking good examples across any account), not an
// owner-only preference. Every other /api/projects/[id]/* route stays
// user_id-scoped as before; this is the one exception, and it's gated by
// isAdminEmail() instead. Body: { featured: boolean }.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  let featured: unknown;
  try {
    const body = await req.json();
    featured = body?.featured;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof featured !== "boolean") {
    return Response.json({ error: "featured must be a boolean." }, { status: 400 });
  }

  try {
    const rows = await sql`
      update projects
      set is_template = ${featured}
      where id = ${params.id}
      returning id, is_template
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ isTemplate: project.is_template });
  } catch (error: any) {
    console.error("[projects/template] failed to update:", error.message);
    return Response.json({ error: "Failed to update template status." }, { status: 500 });
  }
}

// Admin-only read of current is_template state for a build -- lets the
// builder toolbar show the right toggle state without guessing from the
// initial page load props.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const rows = await sql`
      select is_template from projects where id = ${params.id} limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ isTemplate: project.is_template });
  } catch (error: any) {
    console.error("[projects/template] failed to load:", error.message);
    return Response.json({ error: "Failed to load template status." }, { status: 500 });
  }
}
