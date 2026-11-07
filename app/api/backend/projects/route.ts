import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getConnection, getValidAccessToken } from "@/lib/backendStore";
import { listSupabaseProjects } from "@/lib/supabaseBackend";
import { publicProjectList } from "@/lib/backendPick";

// The Supabase projects the user can choose from right after approving the
// connection (see the Connect card in /agent).
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
  const row = await getConnection(projectId, user.id);
  if (!row || row.status === "disconnected") return NextResponse.json({ error: "Connect Supabase first." }, { status: 404 });
  try {
    const token = await getValidAccessToken(row);
    return NextResponse.json({ projects: publicProjectList(await listSupabaseProjects(token)) });
  } catch (e: any) {
    console.error("[backend/projects] failed:", e?.message || e);
    return NextResponse.json({ error: "Couldn't list your Supabase projects. Try connecting again." }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
