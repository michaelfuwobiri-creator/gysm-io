import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PRESENCE_TTL_MS, activeViewers, cleanDisplayName, collabReady, resolveBuildRoot, type PresenceRow } from "@/lib/collab";

// Heartbeat: the builder pings this every ~20s while a build is open and
// visible. It records "I'm here" and returns who else is here right now.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const root = await resolveBuildRoot(params.id, user);
    if (!root) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!(await collabReady())) return Response.json({ ready: false, viewers: [] });

    const name = cleanDisplayName(user.name);
    await sql`
      insert into build_presence (root_id, user_id, display_name, last_seen)
      values (${root}, ${user.id}, ${name}, now())
      on conflict (root_id, user_id) do update set display_name = excluded.display_name, last_seen = now()
    `;
    const rows = (await sql`
      select user_id, display_name, last_seen from build_presence
      where root_id = ${root} and last_seen > now() - ${Math.ceil(PRESENCE_TTL_MS / 1000)} * interval '1 second'
    `) as PresenceRow[];
    return Response.json({ ready: true, viewers: activeViewers(rows, user.id) });
  } catch (error: any) {
    console.error("[collab] presence failed:", error.message);
    return Response.json({ error: "Presence unavailable." }, { status: 500 });
  }
}
