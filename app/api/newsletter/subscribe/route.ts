import { NextRequest, NextResponse } from "next/server";
import { subscribeToAudience } from "@/lib/email/newsletter";

export async function POST(req: NextRequest) {
  const { email, source } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Best-effort: subscribeToAudience already swallows/logs its own errors
  // (see lib/email/newsletter.ts), so a Resend hiccup -- or the audience
  // env var not being set up yet -- doesn't turn into a 500 for someone
  // who just typed their email in. Real failures are visible in the
  // server logs, not surfaced to the visitor.
  await subscribeToAudience(email, process.env.RESEND_AUDIENCE_PROSPECTS);

  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
