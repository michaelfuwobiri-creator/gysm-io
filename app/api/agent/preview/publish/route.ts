import { getUser } from "@/lib/auth";
import { readProjectFiles } from "@/lib/agentTools";
import { saveAgentPreview, selectHostableFiles, setPreviewSlug } from "@/lib/agentProjects";
import { previewHostsFor, previewLinkFor, subdomainsEnabled } from "@/lib/previewSlug";
import { ensureProjectDomain, removeDomainFromProject } from "@/lib/vercelDomains";
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
    let url = named.slug ? previewLinkFor(named.slug, origin) : appFrameUrl(id, "index.html") ?? `${origin}/a/${id}/index.html`;
    let note: string | undefined;
    if (named.slug && subdomainsEnabled()) {
      // Register <name>.gysm.io (and www.<name>.gysm.io -> it) on the Vercel
      // project so each gets a certificate. Already-registered hosts are fine.
      const hosts = previewHostsFor(named.slug);
      try {
        await ensureProjectDomain(hosts.main);
        await ensureProjectDomain(hosts.alias, hosts.main);
        note = "A new name can take a minute to start working while its certificate is issued.";
      } catch (e: any) {
        console.error("[agent] couldn't register preview domain:", e?.message || e);
        url = `${origin}/s/${named.slug}`;
        note = "The gysm.io name isn't ready yet, so here is the gysm.io/s/ link. Try Update again in a minute.";
      }
      if (named.previous && named.previous !== named.slug) {
        const old = previewHostsFor(named.previous);
        await Promise.allSettled([removeDomainFromProject(old.alias), removeDomainFromProject(old.main)]);
      }
    }
    return Response.json({ url, id, slug: named.slug, skipped: picked.skipped, note }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    console.error("[agent] preview publish failed:", error?.message || error);
    const msg = String(error?.message || "");
    return Response.json({ error: msg.startsWith("Multi-file builds") ? msg : "Couldn't create the link. Please try again." }, { status: 500 });
  }
}
