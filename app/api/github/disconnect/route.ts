import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  await sql`delete from github_connections where project_id = ${projectId} and user_id = ${user.id}`;
  return Response.json({ ok: true });
}
