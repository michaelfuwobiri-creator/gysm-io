import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptSecret } from "@/lib/crypto";
import {
  exchangeCodeForToken,
  listOrganizations,
  createProject,
  generateDbPassword,
} from "@/lib/supabaseBackend";
import { createConnectingRow, markProvisioning, markError } from "@/lib/backendStore";

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
    const url = new URL(`${siteUrl}/builder`);
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

    const orgs = await listOrganizations(tokens.access_token);
    if (!orgs.length) {
      await markError(pending.projectId, "No Supabase organization found on this account.");
      return fail("No Supabase organization found on your account.", pending.projectId);
    }
    const org = orgs[0];

    const dbPassword = generateDbPassword();
    const project = await createProject(tokens.access_token, {
      name: `gysm-${pending.projectId.slice(0, 8)}`,
      organizationId: org.id,
      dbPass: dbPassword,
    });

    await markProvisioning(pending.projectId, {
      orgSlug: org.id,
      projectRef: project.ref,
      dbPassword,
    });

    const url = new URL(`${siteUrl}/builder`);
    url.searchParams.set("projectId", pending.projectId);
    url.searchParams.set("backendConnecting", "true");
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
