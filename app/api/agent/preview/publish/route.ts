import { getUser } from "@/lib/auth";
import { readProjectFiles } from "@/lib/agentTools";
import { PUBLISH_READ_LIMITS, publishAgentSite } from "@/lib/agentPublish";

// "Get gysm.io link": publishes the project's workspace files at
// <name>.gysm.io so the user can open and share the site. Calling it again
// refreshes the same address. The Agent's deploy tool does the same thing.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  try {
    const r = await readProjectFiles(user.id, body?.project, { folder: body?.folder, ...PUBLISH_READ_LIMITS });
    if ("error" in r) return Response.json({ error: r.error }, { status: 404 });
    const out = await publishAgentSite({
      userId: user.id,
      project: String(body.project),
      files: r.files,
      slug: typeof body?.slug === "string" ? body.slug : undefined,
      origin: new URL(req.url).origin,
    });
    if ("error" in out) return Response.json({ error: out.error, taken: !!out.taken, id: out.id, skipped: out.skipped }, { status: out.status });
    return Response.json({ url: out.url, id: out.id, slug: out.slug, skipped: out.skipped, note: out.note }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[agent] publish failed:", error?.message || error);
    const msg = String(error?.message || "");
    return Response.json({ error: msg.startsWith("Multi-file builds") ? msg : "Couldn't publish the site. Please try again." }, { status: 500 });
  }
}
