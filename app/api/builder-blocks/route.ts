import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// List + create for builder_block_projects (db/migrations/0022). Owner-
// scoped like every other /api/* route in this codebase (see
// app/api/projects/route.ts) -- no org-sharing here yet since the block
// builder is new and hasn't needed it.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select id, name, updated_at from builder_block_projects
      where user_id = ${user.id}
      order by updated_at desc
      limit 50
    `;
    return Response.json({ projects: rows });
  } catch (error: any) {
    console.error("[builder-blocks] failed to list projects:", error.message);
    return Response.json({ error: "Failed to load your block projects." }, { status: 500 });
  }
}

// Body: { name: string, blocks: BuilderBlock[] }. Creates a new row --
// TopBar.tsx calls this once (no existing projectId in the store) and
// switches to PATCH on the [id] route for every save after that.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let name = "Untitled";
  let blocks: unknown = [];
  try {
    const body = await req.json();
    if (typeof body?.name === "string" && body.name.trim()) name = body.name.trim().slice(0, 120);
    if (Array.isArray(body?.blocks)) blocks = body.blocks;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const rows = await sql`
      insert into builder_block_projects (user_id, name, blocks)
      values (${user.id}, ${name}, ${JSON.stringify(blocks)}::jsonb)
      returning id
    `;
    return Response.json({ id: (rows[0] as any).id, name });
  } catch (error: any) {
    console.error("[builder-blocks] failed to create project:", error.message);
    return Response.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
}
