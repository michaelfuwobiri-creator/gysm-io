import { sql } from "@/lib/db";
import { getProjectFiles } from "@/lib/projectFiles";
import { isBinaryHostedPath, normalizeHostedPath } from "@/lib/projectFilesCore";
import { quote, workspaceRoot } from "@/lib/agentTools";
import { getUserSandbox, runInSandbox } from "@/lib/shell/sandbox";

// Opens a saved build or a template in the Agent: its files are copied into a
// new folder in the user's workspace, so the Agent can preview, change and
// publish it. Replaces the classic builder's ?projectId= / ?template= links.

/** Folder name for an imported build: lowercase letters, digits and hyphens. */
export function folderNameFor(name: string | null | undefined, fallback: string): string {
  const base = String(name ?? "")
    .replace(/^\[Agent\]\s*/i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : fallback;
}

export type ImportResult = { ok: true; folder: string; files: number } | { ok: false; status: number; error: string };

export async function importIntoWorkspace(userId: string, opts: { projectId?: string; templateId?: string }): Promise<ImportResult> {
  const id = opts.projectId || opts.templateId;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, status: 400, error: "Invalid build." };
  const rows = (await sql`select id, user_id, name, prompt, is_template from projects where id = ${id} limit 1`) as any[];
  const row = rows[0];
  const allowed = row && (opts.templateId ? row.is_template === true : row.user_id === userId);
  if (!allowed) return { ok: false, status: 404, error: opts.templateId ? "Template not found." : "Build not found." };

  const files = (await getProjectFiles(row.id)).filter((f) => normalizeHostedPath(f.path));
  if (!files.length) return { ok: false, status: 404, error: "That build has no files." };

  const root = await workspaceRoot(userId);
  const wanted = folderNameFor(row.name || row.prompt, opts.templateId ? "template" : "site");
  // Pick a folder name that isn't taken yet: name, name-2, name-3 ...
  const probe = await runInSandbox(
    userId,
    `for n in ${quote(wanted)} ${Array.from({ length: 19 }, (_, i) => quote(`${wanted}-${i + 2}`)).join(" ")}; do [ -e "$n" ] || { echo "$n"; break; }; done`,
    root,
  );
  const folder = probe.output.trim().split("\n").pop() || "";
  if (!folder || !folder.startsWith(wanted)) return { ok: false, status: 409, error: "Too many copies of this build in your workspace already." };

  const dirs = new Set<string>([`${root}/${folder}`]);
  for (const f of files) {
    const i = f.path.lastIndexOf("/");
    if (i > 0) dirs.add(`${root}/${folder}/${f.path.slice(0, i)}`);
  }
  const mk = await runInSandbox(userId, `mkdir -p -- ${Array.from(dirs).map(quote).join(" ")}`, root);
  if (mk.exitCode !== 0) return { ok: false, status: 500, error: "Couldn't prepare the folder." };

  const sandbox = await getUserSandbox(userId);
  const payload = files.map((f) => ({
    path: `${root}/${folder}/${f.path}`,
    content: isBinaryHostedPath(f.path) ? Buffer.from(f.content, "base64") : Buffer.from(f.content, "utf8"),
  }));
  for (let i = 0; i < payload.length; i += 20) await sandbox.writeFiles(payload.slice(i, i + 20));
  return { ok: true, folder, files: files.length };
}
