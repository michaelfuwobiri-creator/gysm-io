import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Discussion thread on a published BuildGuild app. Reading is public (the
// project itself is already public once is_public=true); posting requires
// sign-in so comments carry a real author. Both routes first confirm the
// target project is actually published -- you can't read or write comments
// on a private/unpublished build by guessing its id.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const project = await sql`select id from projects where id = ${params.id} and is_public = true limit 1`;
    if (project.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const comments = await sql`
      select id, author_name, body, created_at
      from comments
      where project_id = ${params.id}
      order by created_at asc
      limit 500
    `;
    return Response.json({ comments });
  } catch (error: any) {
    console.error("[comments] failed to load comments:", error.message);
    return Response.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in to join the discussion." }, { status: 401 });
  }

  let body = "";
  try {
    const parsed = await req.json();
    body = (parsed?.body ?? "").toString().trim().slice(0, 2000);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body) {
    return Response.json({ error: "Comment can't be empty." }, { status: 400 });
  }

  try {
    const project = await sql`select id from projects where id = ${params.id} and is_public = true limit 1`;
    if (project.length === 0) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const authorName = user.name || "Anonymous builder";
    const rows = await sql`
      insert into comments (project_id, user_id, author_name, body)
      values (${params.id}, ${user.id}, ${authorName}, ${body})
      returning id, author_name, body, created_at
    `;
    return Response.json({ comment: rows[0] });
  } catch (error: any) {
    console.error("[comments] failed to save comment:", error.message);
    return Response.json({ error: "Failed to post comment." }, { status: 500 });
  }
}
