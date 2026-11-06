import { NextRequest } from "next/server";
import { serveBuildFile } from "@/lib/serveBuild";
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

  return serveBuildFile(params.id, params.path, { sandbox: !isolated });
}
