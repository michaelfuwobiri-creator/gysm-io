import { getUser } from "@/lib/auth";
import { importIntoWorkspace } from "@/lib/agentImport";

// Copies one of the user's saved builds (or a template) into their Agent
// workspace so they can keep working on it.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  try {
    const r = await importIntoWorkspace(user.id, {
      projectId: typeof body?.project === "string" ? body.project : undefined,
      templateId: typeof body?.template === "string" ? body.template : undefined,
    });
    if ("error" in r) return Response.json({ error: r.error }, { status: r.status });
    return Response.json({ folder: r.folder, files: r.files });
  } catch (error: any) {
    console.error("[agent] import failed:", error?.message || error);
    return Response.json({ error: "Couldn't open that build in your workspace. Please try again." }, { status: 502 });
  }
}
