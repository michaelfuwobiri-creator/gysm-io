import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Owner-only raw HTML download of a build -- these are single-file
// generated apps (see app/api/generate/route.ts), so the whole thing is
// one .html download, no zip step needed. Scoped to `user_id` on the
// read, same pattern as the other owner-only project routes.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select html, name, prompt from projects where id = ${params.id} and user_id = ${user.id} limit 1
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
