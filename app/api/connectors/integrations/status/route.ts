import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId required." }, { status: 400 });

  const rows = await sql`
    select provider, config, status from project_connectors
    where project_id = ${projectId} and user_id = ${user.id} and provider in ('posthog', 'resend')
  `;
  const posthog = (rows as any[]).find((r) => r.provider === "posthog");
  const resend = (rows as any[]).find((r) => r.provider === "resend");

  return Response.json({
    posthog: posthog ? { connected: true, host: posthog.config?.host } : { connected: false },
    resend: resend ? { connected: true, notifyEmail: resend.config?.notifyEmail } : { connected: false },
  });
}
