import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// "Remix this app" on a public BuildGuild listing -- clones someone
// else's published build into a brand-new project owned by the signed-in
// requester (own id, own version chain, not public). Only reachable for
// rows with is_public = true, the same gate BuildGuild's detail page and
// comments already enforce -- an unpublished project's id 404s here too.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in to remix this app." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select prompt, html, title from projects where id = ${params.id} and is_public = true limit 1
    `;
    const src = rows[0] as any;
    if (!src) {
      return Response.json({ error: "This app isn't available to remix." }, { status: 404 });
    }

    const name = `Remix of ${(src.title || src.prompt || "a build").toString()}`.slice(0, 120);
    const inserted = await sql`
      insert into projects (user_id, prompt, html, name)
      values (${user.id}, ${src.prompt}, ${src.html}, ${name})
      returning id
    `;
    const newId = (inserted[0] as any)?.id;
    return Response.json({ ok: true, id: newId });
  } catch (error: any) {
    console.error("[projects] failed to remix project:", error.message);
    return Response.json({ error: "Failed to remix. Please try again." }, { status: 500 });
  }
}
