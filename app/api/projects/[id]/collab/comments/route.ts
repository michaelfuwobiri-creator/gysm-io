import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  COLLAB_NOT_READY,
  COMMENTS_PER_MINUTE,
  MAX_COMMENTS_RETURNED,
  cleanCommentBody,
  cleanDisplayName,
  collabReady,
  resolveBuildRoot,
} from "@/lib/collab";

// Team discussion on a build the caller can open (their own, or their
// organization's). Unlike /api/projects/[id]/comments, which is the public
// BuildGuild thread on published apps, this works on private builds and is
// shared across every version of the build (keyed by the root project id).

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const root = await resolveBuildRoot(params.id, user);
    if (!root) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!(await collabReady())) return Response.json({ ready: false, comments: [], message: COLLAB_NOT_READY });

    const rows = (await sql`
      select id, user_id, author_name, body, created_at
      from build_comments
      where root_id = ${root}
      order by created_at asc
      limit ${MAX_COMMENTS_RETURNED}
    `) as { id: string; user_id: string; author_name: string; body: string; created_at: string }[];
    return Response.json({
      ready: true,
      comments: rows.map((r) => ({
        id: r.id,
        author_name: r.author_name,
        body: r.body,
        created_at: r.created_at,
        mine: r.user_id === user.id,
      })),
    });
  } catch (error: any) {
    console.error("[collab] failed to load comments:", error.message);
    return Response.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let body: string | null = null;
  try {
    body = cleanCommentBody((await req.json())?.body);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body) return Response.json({ error: "Comment can't be empty." }, { status: 400 });

  try {
    const root = await resolveBuildRoot(params.id, user);
    if (!root) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!(await collabReady())) return Response.json({ error: COLLAB_NOT_READY }, { status: 409 });

    const recent = (await sql`
      select count(*)::int as n from build_comments
      where user_id = ${user.id} and created_at > now() - interval '1 minute'
    `) as { n: number }[];
    if ((recent[0]?.n ?? 0) >= COMMENTS_PER_MINUTE) {
      return Response.json({ error: "You're posting too fast. Try again in a minute." }, { status: 429 });
    }

    const name = cleanDisplayName(user.name);
    const rows = (await sql`
      insert into build_comments (root_id, user_id, author_name, body)
      values (${root}, ${user.id}, ${name}, ${body})
      returning id, author_name, body, created_at
    `) as { id: string; author_name: string; body: string; created_at: string }[];
    return Response.json({ comment: { ...rows[0], mine: true } });
  } catch (error: any) {
    console.error("[collab] failed to save comment:", error.message);
    return Response.json({ error: "Failed to post comment." }, { status: 500 });
  }
}

// Authors can remove their own comments.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const commentId = new URL(req.url).searchParams.get("commentId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) return Response.json({ error: "Invalid comment." }, { status: 400 });
  try {
    const root = await resolveBuildRoot(params.id, user);
    if (!root) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!(await collabReady())) return Response.json({ error: COLLAB_NOT_READY }, { status: 409 });
    await sql`delete from build_comments where id = ${commentId} and root_id = ${root} and user_id = ${user.id}`;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[collab] failed to delete comment:", error.message);
    return Response.json({ error: "Failed to delete comment." }, { status: 500 });
  }
}
