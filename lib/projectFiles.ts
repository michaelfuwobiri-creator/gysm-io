// Database access for multi-file projects (Gap 4). Pure helpers (path rules,
// size caps, file-block parsing) live in projectFilesCore.ts so they can be
// unit tested without a database.
import { ENTRY_PATH, type ProjectFile } from "@/lib/projectFilesCore";

export * from "@/lib/projectFilesCore";

// ---- Database -------------------------------------------------------------
// Every function degrades to single-file behaviour if project_files does not
// exist yet (migration not applied), so shipping this code before running the
// migration cannot break existing builds.

import { sql } from "@/lib/db";

/** All files of a project; always includes index.html (mirrors projects.html). */
export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const rows = (await sql`select html from projects where id = ${projectId} limit 1`) as { html: string }[];
  if (!rows[0]) return [];
  const entry: ProjectFile = { path: ENTRY_PATH, content: rows[0].html };
  try {
    const extra = (await sql`
      select path, content from project_files
      where project_id = ${projectId} and path <> ${ENTRY_PATH}
      order by path
    `) as ProjectFile[];
    return [entry, ...extra];
  } catch {
    return [entry];
  }
}

/** Is the project_files table there (migration 0026 applied)? */
export async function multiFileReady(): Promise<boolean> {
  try {
    await sql`select 1 as x from project_files limit 1`;
    return true;
  } catch {
    return false;
  }
}

export const MULTI_FILE_NOT_READY = "Multi-file builds aren't enabled on this deployment yet (database migration 0026 has not been applied).";

/** True when the build has files beyond index.html. */
export async function hasExtraFiles(projectId: string): Promise<boolean> {
  try {
    const rows = (await sql`
      select 1 as x from project_files where project_id = ${projectId} and path <> ${ENTRY_PATH} limit 1
    `) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** One file by path (index.html comes from projects.html). */
export async function getProjectFile(projectId: string, path: string): Promise<ProjectFile | null> {
  if (path === ENTRY_PATH) {
    const rows = (await sql`select html from projects where id = ${projectId} limit 1`) as { html: string }[];
    return rows[0] ? { path, content: rows[0].html } : null;
  }
  try {
    const rows = (await sql`
      select path, content from project_files where project_id = ${projectId} and path = ${path} limit 1
    `) as ProjectFile[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Replaces the extra files of a project with `files` (already validated) and
 * keeps projects.html in step with index.html. Caller is responsible for
 * having checked ownership.
 */
export async function replaceProjectFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  const entry = files.find((f) => f.path === ENTRY_PATH);
  if (!entry) throw new Error("index.html missing");
  const extras = files.filter((f) => f.path !== ENTRY_PATH);
  const ready = await multiFileReady();
  if (!ready && extras.length > 0) throw new Error(MULTI_FILE_NOT_READY);
  await sql`update projects set html = ${entry.content} where id = ${projectId}`;
  if (!ready) return; // single-file save before the migration: nothing else to store
  await sql`delete from project_files where project_id = ${projectId}`;
  for (const f of extras) {
    await sql`insert into project_files (project_id, path, content) values (${projectId}, ${f.path}, ${f.content})`;
  }
}

/** Copy-on-write for a new version: the new row starts with the old row's files. */
export async function copyProjectFiles(fromId: string, toId: string): Promise<void> {
  try {
    await sql`
      insert into project_files (project_id, path, content)
      select ${toId}, path, content from project_files where project_id = ${fromId} and path <> ${ENTRY_PATH}
    `;
  } catch {
    // Table missing (migration not applied): nothing to copy.
  }
}
