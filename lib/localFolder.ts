// Runs GYSM Agent's local_* tools in the browser against a folder the user
// picked with the File System Access API. The handle never leaves the
// browser; the server only sees the text results the user's browser sends.

import {
  MAX_LOCAL_LIST_ENTRIES,
  MAX_LOCAL_READ_CHARS,
  MAX_LOCAL_WRITE_CHARS,
  checkLocalCall,
  cleanLocalPath,
  truncate,
} from "@/lib/agentCore";

// Minimal structural types so this works with the real DOM handles and with
// the in-memory fake used in tests.
export interface FileLike {
  size: number;
  text(): Promise<string>;
}
export interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<FileLike>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
export interface DirHandleLike {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  values(): AsyncIterable<DirHandleLike | FileHandleLike>;
}

export type LocalResult = { ok: boolean; output: string };

const SKIP_IN_LIST = new Set([".git", "node_modules", ".next", ".DS_Store"]);

async function walkDir(root: DirHandleLike, rel: string, create = false): Promise<DirHandleLike> {
  let dir = root;
  for (const seg of rel.split("/").filter(Boolean)) dir = await dir.getDirectoryHandle(seg, { create });
  return dir;
}

async function fileAt(root: DirHandleLike, rel: string, create = false): Promise<FileHandleLike> {
  const parts = rel.split("/").filter(Boolean);
  const name = parts.pop() as string;
  const dir = await walkDir(root, parts.join("/"), create);
  return dir.getFileHandle(name, { create });
}

function looksBinary(s: string): boolean {
  return s.slice(0, 4000).includes("\0");
}

function describeError(e: any): string {
  const n = e?.name;
  if (n === "NotFoundError") return "Not found in the connected folder.";
  if (n === "NotAllowedError" || n === "SecurityError") return "The browser no longer has permission for this folder. Ask the user to reconnect it.";
  if (n === "TypeMismatchError") return "That path is a different kind of item than expected (file vs folder).";
  return String(e?.message || e || "Failed").slice(0, 300);
}

/** Does the file already exist? Used to label an approval as Create or Overwrite. */
export async function localFileExists(root: DirHandleLike, rel: string): Promise<boolean> {
  try {
    await fileAt(root, rel);
    return true;
  } catch {
    return false;
  }
}

/** Runs one local tool call. Safe to call with untrusted args: they are re-checked here. */
export async function runLocalTool(root: DirHandleLike, name: string, args: any): Promise<LocalResult> {
  const problem = checkLocalCall(name, args);
  if (problem) return { ok: false, output: problem };
  try {
    if (name === "local_list") {
      const rel = cleanLocalPath(args?.path, true) as string;
      const dir = await walkDir(root, rel);
      const rows: { name: string; line: string }[] = [];
      let hidden = 0;
      for await (const entry of dir.values()) {
        if (SKIP_IN_LIST.has(entry.name)) {
          hidden++;
          continue;
        }
        if (rows.length >= MAX_LOCAL_LIST_ENTRIES) {
          hidden++;
          continue;
        }
        if (entry.kind === "directory") rows.push({ name: entry.name, line: `${entry.name}/` });
        else {
          let size = "";
          try {
            size = ` (${(await (entry as FileHandleLike).getFile()).size} bytes)`;
          } catch {
            /* ignore */
          }
          rows.push({ name: entry.name, line: `${entry.name}${size}` });
        }
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      const out = rows.map((r) => r.line).join("\n") || "(empty folder)";
      return { ok: true, output: hidden ? `${out}\n(${hidden} more not shown: .git, node_modules or beyond the list limit)` : out };
    }

    const rel = cleanLocalPath(args?.path) as string;

    if (name === "local_read") {
      const file = await (await fileAt(root, rel)).getFile();
      if (file.size > 2_000_000) return { ok: false, output: `File is too large to read (${file.size} bytes).` };
      const text = await file.text();
      if (looksBinary(text)) return { ok: false, output: "That looks like a binary file; only text files can be read." };
      return { ok: true, output: truncate(text, MAX_LOCAL_READ_CHARS) };
    }

    if (name === "local_write") {
      const content = String(args.content);
      const fh = await fileAt(root, rel, true);
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
      return { ok: true, output: `Wrote ${content.length} characters to ${rel}.` };
    }

    if (name === "local_edit") {
      const fh = await fileAt(root, rel);
      const file = await fh.getFile();
      if (file.size > MAX_LOCAL_WRITE_CHARS * 2) return { ok: false, output: "File is too large to edit safely." };
      const text = await file.text();
      if (looksBinary(text)) return { ok: false, output: "That looks like a binary file; only text files can be edited." };
      const first = text.indexOf(args.old_string);
      if (first === -1) return { ok: false, output: "old_string was not found in the file. Read it again and copy the text exactly." };
      if (text.indexOf(args.old_string, first + 1) !== -1) return { ok: false, output: "old_string appears more than once. Include more surrounding text to make it unique." };
      const next = text.slice(0, first) + args.new_string + text.slice(first + args.old_string.length);
      const w = await fh.createWritable();
      await w.write(next);
      await w.close();
      return { ok: true, output: `Edited ${rel}.` };
    }

    return { ok: false, output: `Unknown local tool: ${name}` };
  } catch (e: any) {
    return { ok: false, output: describeError(e) };
  }
}

/** Is the File System Access folder picker available in this browser? */
export function folderAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";
}
