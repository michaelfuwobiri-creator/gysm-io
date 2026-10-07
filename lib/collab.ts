// Database access for build comments and presence (Gap 7 slice). Everything
// degrades gracefully when migration 0027 has not been applied: callers get
// `ready: false` and the UI says so instead of erroring.
import { sql } from "@/lib/db";

export * from "@/lib/collabCore";

export const COLLAB_NOT_READY =
  "Team comments aren't enabled on this deployment yet (database migration 0027 has not been applied).";

type Viewer = { id: string; orgId: string | null };

/**
 * The root id of the build this project belongs to, if the caller may access
 * it (their own build, or one in their active organization). null otherwise,
 * which callers must treat as "not found" so ids can't be probed.
 */
export async function resolveBuildRoot(projectId: string, user: Viewer): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const rows = (await sql`
    select coalesce(root_project_id, id) as root
    from projects
    where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
    limit 1
  `) as { root: string }[];
  return rows[0]?.root ?? null;
}

export async function collabReady(): Promise<boolean> {
  try {
    await sql`select 1 as x from build_comments limit 1`;
    await sql`select 1 as x from build_presence limit 1`;
    return true;
  } catch {
    return false;
  }
}
