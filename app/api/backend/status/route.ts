import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getConnection, getValidAccessToken, markActive, markError, toPublic } from "@/lib/backendStore";
import { getProject, getProjectApiKeys } from "@/lib/supabaseBackend";

// Polled by the builder UI while a "Connect database" provision is in
// flight (Supabase project creation takes roughly 1-2 minutes).
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });

  const row = await getConnection(projectId, user.id);
  if (!row) return NextResponse.json({ status: "none" });

  if (row.status !== "provisioning") {
    return NextResponse.json(toPublic(row));
  }

  try {
    const token = await getValidAccessToken(row);
    const ref = row.supabase_project_ref!;
    const project = await getProject(token, ref);

    if (project.status === "ACTIVE_HEALTHY") {
      const keys = await getProjectApiKeys(token, ref);
      const anon = keys.find((k) => k.name === "anon")?.api_key;
      if (!anon) throw new Error("Supabase project came up but no anon key was returned.");
      await markActive(projectId, { apiUrl: `https://${ref}.supabase.co`, anonKey: anon });
    } else if (project.status === "INIT_FAILED" || project.status === "REMOVED") {
      await markError(projectId, `Supabase project provisioning failed (${project.status}).`);
    }
    // else: still coming up, unchanged -- UI will poll again.
  } catch (err: any) {
    console.error("[backend/status] poll failed:", err?.message || err);
    // Don't flip to 'error' on a transient poll failure -- just report
    // current state and let the next poll retry.
  }

  const fresh = await getConnection(projectId, user.id);
  return NextResponse.json(fresh ? toPublic(fresh) : { status: "none" });
}

export const dynamic = "force-dynamic";
