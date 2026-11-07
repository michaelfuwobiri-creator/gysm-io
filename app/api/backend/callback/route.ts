import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSecret } from "@/lib/crypto";
import { exchangeCodeForToken } from "@/lib/supabaseBackend";
import { createConnectingRow, markError } from "@/lib/backendStore";

// Supabase redirects here after the user approves the "Connect Supabase"
// consent screen. See app/api/backend/connect/route.ts for the first leg.
export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const cookieStore = cookies();
  const pendingCookie = cookieStore.get("sb_oauth_pending")?.value;
  cookieStore.delete("sb_oauth_pending");

  const fail = (message: string, projectId?: string) => {
    const url = new URL(`${siteUrl}/agent`);
    if (projectId) url.searchParams.set("projectId", projectId);
    url.searchParams.set("backendError", message);
    return NextResponse.redirect(url.toString());
  };

  if (oauthError) return fail(`Supabase declined: ${oauthError}`);
  if (!code || !state) return fail("Missing code or state from Supabase.");
  if (!pendingCookie) return fail("This connection attempt expired. Try again.");

  let pending: { codeVerifier: string; nonce: string; projectId: string; userId: string };
  try {
    pending = JSON.parse(decryptSecret(pendingCookie));
  } catch {
    return fail("Could not verify this connection attempt. Try again.");
  }
  if (pending.nonce !== state) {
    return fail("State mismatch -- possible CSRF. Try again.", pending.projectId);
  }

  try {
    const tokens = await exchangeCodeForToken(code, pending.codeVerifier);
    const row = await createConnectingRow({
      projectId: pending.projectId,
      userId: pending.userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresInSeconds: tokens.expires_in,
    });

    // The user now chooses an existing Supabase project (free accounts only
    // have two) or a new one: see app/api/backend/link/route.ts.
    const url = new URL(`${siteUrl}/agent`);
    url.searchParams.set("projectId", pending.projectId);
    url.searchParams.set("backendPick", "1");
    return NextResponse.redirect(url.toString());
  } catch (err: any) {
    console.error("[backend/callback] failed:", err?.message || err);
    try {
      await markError(pending.projectId, "Could not provision your Supabase project.");
    } catch {}
    return fail("Could not connect your database. Try again.", pending.projectId);
  }
}

export const dynamic = "force-dynamic";
