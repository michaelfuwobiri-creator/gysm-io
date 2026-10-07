import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import JSZip from "jszip";
import { sql } from "@/lib/db";
import { getProjectFiles } from "@/lib/projectFiles";

// Owner-only download of a build. A single-file build is one .html file; a
// multi-file build (see lib/projectFiles.ts) downloads as a zip of its files. Scoped to `user_id` on the
// read, same pattern as the other owner-only project routes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select html, name, prompt from projects
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const base = (project.name || project.prompt || "gysm-app")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "")
      .slice(0, 60) || "gysm-app";

    const files = await getProjectFiles(params.id);
    if (files.length > 1) {
      const zip = new JSZip();
      for (const f of files) zip.file(f.path, f.content);
      const buffer = await zip.generateAsync({ type: "uint8array" });
      return new Response(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${base}.zip"`,
        },
      });
    }

    return new Response(project.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.html"`,
      },
    });
  } catch (error: any) {
    console.error("[projects] failed to download project:", error.message);
    return Response.json({ error: "Failed to download. Please try again." }, { status: 500 });
  }
}
