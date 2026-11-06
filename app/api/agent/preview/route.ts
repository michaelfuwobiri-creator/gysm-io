import { getUser } from "@/lib/auth";
import { readProjectFiles } from "@/lib/agentTools";

// Files of one of the signed-in user's Agent projects, for the Preview panel.
// Reads only the caller's own sandbox workspace.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const project = new URL(req.url).searchParams.get("project");
  try {
    const r = await readProjectFiles(user.id, project);
    if ("error" in r) return Response.json({ error: r.error }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ files: r.files }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[agent] preview failed:", error?.message || error);
    return Response.json({ error: "Couldn't reach your workspace. Please try again." }, { status: 502 });
  }
}
