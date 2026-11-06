import { sql } from "@/lib/db";
import { injectAiGeneratedMeta } from "@/lib/aiDisclosure";
import { ENTRY_PATH, hostedContentType, isBinaryHostedPath, normalizeHostedPath } from "@/lib/projectFilesCore";
import { getProjectFile } from "@/lib/projectFiles";

// Shared by /a/<id>/... and /s/<name>/...: answers with one file of a build.
export async function serveBuildFile(projectId: string, pathParts: string[] | undefined, opts: { sandbox: boolean }): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const requested = pathParts && pathParts.length ? pathParts.join("/") : ENTRY_PATH;
  const path = normalizeHostedPath(requested);
  if (!path) return notFound();

  let file;
  try {
    file = await getProjectFile(projectId, path);
  } catch (error: any) {
    console.error("[serve] failed to load file:", error.message);
    return new Response("Server error", { status: 500 });
  }
  if (!file) return notFound();

  if (path === ENTRY_PATH) {
    // Count a view only for the entry page, same as /publish/[id].
    sql`update projects set views = views + 1 where id = ${projectId}`.catch(() => {});
  }

  const body: BodyInit = isBinaryHostedPath(path)
    ? new Uint8Array(Buffer.from(file.content, "base64"))
    : path.endsWith(".html") || path.endsWith(".htm")
      ? injectAiGeneratedMeta(file.content)
      : file.content;
  const headers: Record<string, string> = {
    "Content-Type": hostedContentType(path),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "public, max-age=0, must-revalidate",
  };
  if (opts.sandbox) {
    headers["Content-Security-Policy"] = "sandbox allow-scripts allow-forms allow-popups allow-modals";
  }
  return new Response(body, { headers });
}
