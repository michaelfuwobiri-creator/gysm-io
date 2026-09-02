import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { sanitizeTags, toPgTextArrayLiteral } from "@/lib/buildTags";

// Owner-only publish/unpublish toggle for BuildGuild (see app/buildguild).
// POST { title, tagline, tags } -> publishes; DELETE -> unpublishes. Both
// are scoped to `user_id = ${user.id}` in the WHERE clause, not just
// checked in application logic, so there's no window where one user's
// request could touch another user's row even if an id were guessed or
// reused. `tags` is validated server-side against the fixed BUILD_TAGS
// whitelist (see lib/buildTags.ts) -- never trust the picker UI alone.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in to publish to BuildGuild." }, { status: 401 });
  }

  let title = "";
  let tagline = "";
  let tags: string[] = [];
  try {
    const body = await req.json();
    title = (body?.title ?? "").toString().trim().slice(0, 120);
    tagline = (body?.tagline ?? "").toString().trim().slice(0, 200);
    tags = sanitizeTags(body?.tags);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!title) {
    return Response.json({ error: "Give your app a title before publishing." }, { status: 400 });
  }

  try {
    const rows = await sql`
      update projects
      set is_public = true,
          title = ${title},
          tagline = ${tagline || null},
          publisher_name = ${user.name},
          published_at = now(),
          tags = ${toPgTextArrayLiteral(tags)}::text[]
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ ok: true, id: params.id });
  } catch (error: any) {
    console.error("[publish] failed to publish project:", error.message);
    return Response.json({ error: "Failed to publish. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      update projects
      set is_public = false
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }
    return Response.json({ ok: true, id: params.id });
  } catch (error: any) {
    console.error("[publish] failed to unpublish project:", error.message);
    return Response.json({ error: "Failed to unpublish. Please try again." }, { status: 500 });
  }
}
