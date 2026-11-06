import { NextRequest } from "next/server";
import { projectIdForSlug } from "@/lib/agentProjects";
import { serveBuildFile } from "@/lib/serveBuild";
import { cleanSlug, slugFromHost, slugProblem } from "@/lib/previewSlug";

// A hosted preview by name: www.gysm.io/s/<name>, and <name>.gysm.io once the
// wildcard domain is on (middleware rewrites that host to this route). Always
// served with a CSP sandbox so the site can't touch GYSM's cookies or APIs.

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: { slug: string; path?: string[] } }) {
  const slug = cleanSlug(params.slug);
  if (slug !== params.slug || slugProblem(slug)) return notFound();

  const onOwnHost = slugFromHost(req.headers.get("host")) === slug;
  // /s/<name> has no trailing slash, so relative links (styles.css) would
  // resolve to /s/styles.css. Send it to the page's real path instead.
  if (!onOwnHost && !(params.path && params.path.length)) {
    return Response.redirect(new URL(`/s/${slug}/index.html`, req.url), 307);
  }

  let id: string | null;
  try {
    id = await projectIdForSlug(slug);
  } catch (error: any) {
    console.error("[s] slug lookup failed:", error?.message || error);
    return new Response("Server error", { status: 500 });
  }
  if (!id) return notFound();
  return serveBuildFile(id, params.path, { sandbox: true });
}
