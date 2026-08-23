import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "", provider = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
    provider = (body?.provider ?? "").toString();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId || !["posthog", "resend"].includes(provider)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  await sql`delete from project_connectors where project_id = ${projectId} and user_id = ${user.id} and provider = ${provider}`;
  return Response.json({ ok: true });
}
