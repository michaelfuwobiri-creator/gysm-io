import { sql } from "@/lib/db";

/** Edits save as a new project row, so move the GitHub link onto the newest
 *  row (the same thing relinkProjectId does for a connected database).
 *  No-op when the old row has no GitHub connection. */
export async function relinkGithubConnection(oldProjectId: string, newProjectId: string) {
  await sql`
    update github_connections set project_id = ${newProjectId}, updated_at = now()
    where project_id = ${oldProjectId}
  `;
}
