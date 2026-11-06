import { getUser } from "@/lib/auth";
import { readProjectFiles } from "@/lib/agentTools";
import { saveAgentPreview, selectHostableFiles, setPreviewSlug } from "@/lib/agentProjects";
import { previewLinkFor } from "@/lib/previewSlug";
import { appFrameUrl } from "@/lib/userContent";

// "Get a gysm.io link": hosts a copy of the project's workspace files at
// /a/<project id>/ so the user can open (and share) the preview before any
// Vercel deploy. Calling it again refreshes the same link.
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
    const r = await readProjectFiles(user.id, body?.project);
    if ("error" in r) return Response.json({ error: r.error }, { status: 404 });
    const picked = selectHostableFiles(r.files);
    if (picked.error) return Response.json({ error: picked.error }, { status: 422 });
    const id = await saveAgentPreview({ userId: user.id, project: String(body.project), files: picked.files });
    const named = await setPreviewSlug({ id, userId: user.id, wanted: body?.slug, fallbackFrom: String(body.project) });
    const origin = new URL(req.url).origin;
    // Files are saved either way; a bad or taken name is reported so the user can pick another.
    if (named.error && body?.slug) {
      return Response.json({ error: named.error, taken: !!named.taken, id, skipped: picked.skipped }, { status: named.taken ? 409 : 422 });
    }
    const url = named.slug ? previewLinkFor(named.slug, origin) : appFrameUrl(id, "index.html") ?? `${origin}/a/${id}/index.html`;
    return Response.json({ url, id, slug: named.slug, skipped: picked.skipped }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[agent] preview publish failed:", error?.message || error);
    const msg = String(error?.message || "");
    return Response.json({ error: msg.startsWith("Multi-file builds") ? msg : "Couldn't create the link. Please try again." }, { status: 500 });
  }
}
