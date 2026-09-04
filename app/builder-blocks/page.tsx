import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import BuilderBlocksClient from "./BuilderBlocksClient";
import type { BuilderBlock } from "@/lib/builderBlocks/blockDefs";

// Drag-and-drop "Lego builder" core -- a new, separate route from the
// existing prompt-driven AI builder at /builder (LinearBuilderClient.tsx).
// Confirmed with the user this doesn't replace /builder: that's a
// ~3600-line, already-shipped product surface with real users; this is a
// genuinely different building paradigm living alongside it, surfaced via
// the homepage's "Products" nav menu (see app/components/ProductsNavMenu.tsx)
// and the dashboard sidebar (AppShell.tsx).
//
// Server-side auth check mirrors app/dashboard/page.tsx's own pattern
// (getUser() + redirect()), not the client-side useUser() the original
// queue prompt suggested -- this codebase's established convention for
// page-level gating is server-side; middleware.ts's isBuilderRoute also
// covers /builder-blocks for defense-in-depth.
export const dynamic = "force-dynamic";

export default async function BuilderBlocksPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const user = await getUser();
  if (!user) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent("/builder-blocks")}`);
  }

  let initialProject: { id: string; name: string; blocks: BuilderBlock[] } | null = null;
  if (searchParams.id) {
    try {
      const rows = await sql`
        select id, name, blocks from builder_block_projects
        where id = ${searchParams.id} and user_id = ${user.id}
        limit 1
      `;
      const row = rows[0] as any;
      if (row) {
        initialProject = { id: row.id, name: row.name, blocks: row.blocks as BuilderBlock[] };
      }
    } catch (error: any) {
      console.error("[builder-blocks] failed to load project:", error.message);
    }
  }

  return <BuilderBlocksClient initialProject={initialProject} />;
}
