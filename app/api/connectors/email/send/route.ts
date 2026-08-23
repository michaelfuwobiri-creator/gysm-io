import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// PUBLIC route -- called by a visitor's browser on a *published* GYSM
// app's own contact form, not by a signed-in GYSM user. No auth check on
// purpose. The abuse guard is structural instead: `to` is never taken
// from the request body, only ever the notifyEmail the build's OWNER
// configured when connecting Resend (see /api/connectors/integrations/connect).
// That means this can only ever deliver mail to an address its owner
// already chose to receive it at -- it can't be used as an open relay to
// send to arbitrary third parties, no matter what a caller passes in.
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let projectId = "", subject = "", message = "", replyTo = "";
  try {
    const body = await req.json();
    projectId = (body?.projectId ?? "").toString();
    subject = (body?.subject ?? "New message").toString().slice(0, 200);
    message = (body?.message ?? "").toString().slice(0, 10_000);
    replyTo = (body?.replyTo ?? "").toString().slice(0, 320);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId || !message.trim()) {
    return Response.json({ error: "A message is required." }, { status: 400 });
  }

  const rows = await sql`
    select config, secret_encrypted from project_connectors
    where project_id = ${projectId} and provider = 'resend' and status = 'active'
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) {
    return Response.json({ error: "This app doesn't have email set up." }, { status: 400 });
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.secret_encrypted);
  } catch (error: any) {
    console.error("[email send] failed to decrypt key:", error.message);
    return Response.json({ error: "Email is temporarily unavailable for this app." }, { status: 500 });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "GYSM App <onboarding@resend.dev>",
        to: [row.config.notifyEmail],
        subject,
        text: message,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email send] Resend rejected the request:", res.status, body.slice(0, 300));
      return Response.json({ error: "Failed to send. Please try again." }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[email send] failed:", error.message);
    return Response.json({ error: "Failed to send. Please try again." }, { status: 500 });
  }
}
