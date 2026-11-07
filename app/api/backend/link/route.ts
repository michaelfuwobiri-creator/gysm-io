import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getConnection, getValidAccessToken, markActive, markError, markProvisioning } from "@/lib/backendStore";
import { createProject, generateDbPassword, getProject, getProjectApiKeys, listOrganizations, listSupabaseProjects } from "@/lib/supabaseBackend";
import { isSupabaseRef } from "@/lib/backendPick";

// Finishes "Connect database": links the build to a Supabase project the user
// picked from their own account, or creates a new one when they ask for that.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  const row = await getConnection(projectId, user.id);
  if (!row || row.status === "disconnected") return NextResponse.json({ error: "Connect Supabase first." }, { status: 404 });

  try {
    const token = await getValidAccessToken(row);

    if (body?.create === true) {
      const orgs = await listOrganizations(token);
      if (!orgs.length) return NextResponse.json({ error: "No Supabase organization found on your account." }, { status: 400 });
      const dbPassword = generateDbPassword();
      const created = await createProject(token, { name: `gysm-${projectId.slice(0, 8)}`, organizationId: orgs[0].id, dbPass: dbPassword });
      await markProvisioning(projectId, { orgSlug: orgs[0].id, projectRef: created.ref, dbPassword });
      return NextResponse.json({ status: "provisioning" });
    }

    const ref = body?.ref;
    if (!isSupabaseRef(ref)) return NextResponse.json({ error: "Choose one of your Supabase projects." }, { status: 400 });
    // Only projects in the account the user approved can be linked.
    const mine = await listSupabaseProjects(token);
    const found = mine.find((p) => p.ref === ref);
    if (!found) return NextResponse.json({ error: "That project isn't in your Supabase account." }, { status: 404 });
    const project = await getProject(token, ref);
    if (project.status !== "ACTIVE_HEALTHY") {
      return NextResponse.json({ error: `That project isn't running yet (${project.status}). Resume it in Supabase, then try again.` }, { status: 409 });
    }
    const keys = await getProjectApiKeys(token, ref);
    const anon = keys.find((k) => k.name === "anon")?.api_key;
    if (!anon) return NextResponse.json({ error: "Supabase didn't return the public key for that project." }, { status: 502 });
    // No database password is needed: SQL runs through the Management API with the user's token.
    await markProvisioning(projectId, { orgSlug: found.organization_id || "", projectRef: ref, dbPassword: "linked-existing-project" });
    await markActive(projectId, { apiUrl: `https://${ref}.supabase.co`, anonKey: anon });
    return NextResponse.json({ status: "active" });
  } catch (e: any) {
    console.error("[backend/link] failed:", e?.message || e);
    try {
      await markError(projectId, "Could not link that Supabase project.");
    } catch {
      /* best effort */
    }
    return NextResponse.json({ error: "Couldn't link that project. Try again." }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
