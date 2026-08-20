import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { hasActiveSubscription } from "@/lib/credits";
import { generatePkce, buildAuthorizeUrl, isBackendConnectConfigured } from "@/lib/supabaseBackend";
import { encryptSecret } from "@/lib/crypto";
import { randomUUID } from "crypto";

// Starts the "Connect database" OAuth handshake for one project. See
// lib/supabaseBackend.ts and db/migrations/0003_connected_backends.sql.
export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(`${siteUrl}/sign-in?redirect_url=/builder`);
  }

  if (!isBackendConnectConfigured()) {
    return NextResponse.json(
      { error: "Database connections aren't configured yet on this deployment." },
      { status: 503 }
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  }

  const projectRows = await sql`select id from projects where id = ${projectId} and user_id = ${user.id} limit 1`;
  if (!projectRows[0]) {
    return NextResponse.json({ error: "Build not found." }, { status: 404 });
  }

  // "Connect database" turns a mocked build into a real one -- gated to
  // paid plans (the value being sold is the unlock, not hosted infra:
  // the user's own free-tier Supabase project covers the database).
  const subscribed = await hasActiveSubscription(user.id);
  if (!subscribed) {
    return NextResponse.redirect(`${siteUrl}/pricing?upsell=connect_database`);
  }

  const { codeVerifier, codeChallenge } = generatePkce();
  const nonce = randomUUID();

  const cookieStore = cookies();
  cookieStore.set(
    "sb_oauth_pending",
    encryptSecret(JSON.stringify({ codeVerifier, nonce, projectId, userId: user.id })),
    { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" }
  );

  const authorizeUrl = buildAuthorizeUrl({ state: nonce, codeChallenge });
  return NextResponse.redirect(authorizeUrl);
}

export const dynamic = "force-dynamic";
