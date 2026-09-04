import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Owner-only read of one block project -- used by app/builder-blocks/
// page.tsx when opening an existing project via ?id=.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select id, name, blocks, created_at, updated_at from builder_block_projects
      where id = ${params.id} and user_id = ${user.id}
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json(project);
  } catch (error: any) {
    console.error("[builder-blocks] failed to load project:", error.message);
    return Response.json({ error: "Failed to load project." }, { status: 500 });
  }
}

// Body: { name: string, blocks: BuilderBlock[] } -- the Save button's
// every-save-after-the-first path (TopBar.tsx).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
      update builder_block_projects
      set name = ${name}, blocks = ${JSON.stringify(blocks)}::jsonb, updated_at = now()
      where id = ${params.id} and user_id = ${user.id}
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ id: params.id, name });
  } catch (error: any) {
    console.error("[builder-blocks] failed to save project:", error.message);
    return Response.json({ error: "Failed to save. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      delete from builder_block_projects
      where id = ${params.id} and user_id = ${user.id}
      returning id
    `;
    if (rows.length === 0) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[builder-blocks] failed to delete project:", error.message);
    return Response.json({ error: "Failed to delete. Please try again." }, { status: 500 });
  }
}
