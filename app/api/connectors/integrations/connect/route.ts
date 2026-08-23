import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";

// PostHog (analytics) and Resend (contact-form email) connectors -- same
// project_connectors table Airtable/Google Sheets use (see
// db/migrations/0012_gap_features.sql). PostHog's project API key is
// designed to be public (same trust model as a Supabase anon key), so it
// goes straight into `config` and later gets embedded client-side in the
// generated app. A Resend API key is NOT designed to be public, so it's
// encrypted and only ever used server-side, via /api/connectors/email/send
// -- see that route for the abuse-guard this implies (it can only ever
// send TO the address given here, never to an address a site visitor
// controls).
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  let projectId = "", provider = "", apiKey = "", host = "", notifyEmail = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
    provider = (body?.provider ?? "").toString();
    apiKey = (body?.apiKey ?? "").toString().trim();
    host = (body?.host ?? "").toString().trim();
    notifyEmail = (body?.notifyEmail ?? "").toString().trim();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId || !["posthog", "resend"].includes(provider)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ownerRows = await sql`
    select id from projects where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId})) limit 1
  `;
  if (!ownerRows[0]) return Response.json({ error: "Build not found." }, { status: 404 });

  let config: Record<string, any> = {};
  let secretEncrypted: string | null = null;

  if (provider === "posthog") {
    if (!apiKey) return Response.json({ error: "A PostHog project API key is required." }, { status: 400 });
    config = { apiKey, host: host || "https://us.i.posthog.com" };
  } else {
    if (!apiKey || !notifyEmail) {
      return Response.json({ error: "A Resend API key and the inbox to notify are both required." }, { status: 400 });
    }
    const verifyRes = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (verifyRes.status === 401 || verifyRes.status === 403) {
      return Response.json({ error: "That API key was rejected by Resend. Check it's correct." }, { status: 400 });
    }
    config = { notifyEmail };
    secretEncrypted = encryptSecret(apiKey);
  }

  await sql`
    insert into project_connectors (project_id, user_id, provider, config, secret_encrypted, status)
    values (${projectId}, ${user.id}, ${provider}, ${JSON.stringify(config)}, ${secretEncrypted}, 'active')
    on conflict (project_id, provider) do update set
      config = excluded.config, secret_encrypted = excluded.secret_encrypted,
      status = 'active', error_message = null, updated_at = now()
  `;

  return Response.json({ ok: true });
}
