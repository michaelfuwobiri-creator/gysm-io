import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Block the author of a BuildGuild comment. The client sends the comment id
// (never a user id), so author ids aren't exposed to other users.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in to block users." }, { status: 401 });

  let commentId = "";
  try {
    commentId = String((await req.json())?.commentId ?? "");
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(commentId)) return Response.json({ error: "Invalid comment." }, { status: 400 });

  try {
    const rows = await sql`select user_id from comments where id = ${commentId} limit 1`;
    const authorId = rows[0]?.user_id as string | undefined;
    if (!authorId) return Response.json({ error: "Comment not found." }, { status: 404 });
    if (authorId === user.id) return Response.json({ error: "You can't block yourself." }, { status: 400 });

    await sql`
      insert into user_blocks (blocker_id, blocked_id) values (${user.id}, ${authorId})
      on conflict do nothing
    `;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[blocks] failed:", error.message);
    return Response.json({ error: "Couldn't block this user. Please try again." }, { status: 500 });
  }
}
