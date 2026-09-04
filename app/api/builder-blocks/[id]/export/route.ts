import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateHtml } from "@/lib/builderBlocks/codeGenerator";

// "Deploy" for the block builder deliberately doesn't reinvent hosting,
// exporting, or publishing -- it generates the standalone HTML (same
// codeGenerator.ts the Code modal uses) and inserts it as a real row in
// the existing `projects` table (db/migrations/0001_init.sql), the same
// table every AI-builder project lives in. That one insert is enough to
// make the new build show up on /dashboard and immediately usable with
// every already-built piece of project machinery -- PublishButton,
// DeployVercelButton, DuplicateButton, DownloadButton, template curation
// -- without duplicating any of it here.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select name, blocks from builder_block_projects
      where id = ${params.id} and user_id = ${user.id}
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Block project not found." }, { status: 404 });
    }

    const name = project.name || "Untitled";
    const html = generateHtml(project.blocks || [], name);

    const inserted = await sql`
      insert into projects (user_id, prompt, html, name, is_template)
      values (${user.id}, ${`[Block Builder] ${name}`}, ${html}, ${name}, false)
      returning id
    `;
    const newProjectId = (inserted[0] as any).id;
    return Response.json({ projectId: newProjectId });
  } catch (error: any) {
    console.error("[builder-blocks] failed to export/deploy project:", error.message);
    return Response.json({ error: "Deploy failed. Please try again." }, { status: 500 });
  }
}
