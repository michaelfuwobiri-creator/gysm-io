import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { injectAiGeneratedMeta } from "@/lib/aiDisclosure";
import { ENTRY_PATH, contentTypeFor, normalizePath } from "@/lib/projectFilesCore";
import { getProjectFile } from "@/lib/projectFiles";
import { isUserContentHost, userContentOrigin } from "@/lib/userContent";

// Serves a build's files at real URLs (/a/<project id>/<path>) so relative
// links such as styles.css and pages/about.html resolve. This is how
// multi-file builds are previewed and published.
//
// Isolation: generated apps are arbitrary JavaScript, so they must not run on
// the same origin as the signed-in app. When USER_CONTENT_ORIGIN is set this
// route answers ONLY on that host (the main site 404s here), which puts every
// app on its own origin. When it is not set, responses carry a CSP sandbox
// without allow-same-origin: the app still runs, but in an opaque origin with
// no access to GYSM's cookies or APIs (localStorage is unavailable there).
//
// Visibility matches /publish/[id]: anyone with the project id can load it.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: { id: string; path?: string[] } }) {
  const isolated = userContentOrigin() !== null;
  if (isolated && !isUserContentHost(req.headers.get("host"))) return notFound();

  if (!UUID_RE.test(params.id)) return notFound();

  const requested = params.path && params.path.length ? params.path.join("/") : ENTRY_PATH;
  const path = normalizePath(requested);
  if (!path) return notFound();

  let file;
  try {
    file = await getProjectFile(params.id, path);
  } catch (error: any) {
    console.error("[a] failed to load file:", error.message);
    return new Response("Server error", { status: 500 });
  }
  if (!file) return notFound();

  if (path === ENTRY_PATH) {
    // Count a view only for the entry page, same as /publish/[id].
    sql`update projects set views = views + 1 where id = ${params.id}`.catch(() => {});
  }

  const body = path.endsWith(".html") ? injectAiGeneratedMeta(file.content) : file.content;
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(path),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=0, must-revalidate",
  };
  if (!isolated) {
    headers["Content-Security-Policy"] = "sandbox allow-scripts allow-forms allow-popups allow-modals";
  }
  return new Response(body, { headers });
}
