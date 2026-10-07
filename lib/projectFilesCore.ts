// Multi-file project support (Gap 4). The entry document stays in
// projects.html so every existing reader keeps working; additional files live
// in project_files (db/migrations/0026). A build with no rows there is a
// classic single-file build.
//
// Everything in the first half of this file is pure (no DB) so it can be unit
// tested: path validation, size caps, content types, and the file-block format
// the model uses to return several files.

export const MAX_FILES = 40;
export const MAX_FILE_BYTES = 500_000;
export const MAX_TOTAL_BYTES = 2_000_000;
export const ENTRY_PATH = "index.html";

export type ProjectFile = { path: string; content: string };

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export const ALLOWED_EXTENSIONS = Object.keys(CONTENT_TYPES);

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "text/plain; charset=utf-8";
}

/**
 * Returns the cleaned path, or null if it is not acceptable. Rejects anything
 * that could escape the project or hide: "..", absolute paths, backslashes,
 * hidden segments, odd characters, unknown extensions.
 */
export function normalizePath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim().replace(/^\.\//, "");
  if (!p || p.length > 120) return null;
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0")) return null;
  if (!/^[A-Za-z0-9._\-/]+$/.test(p)) return null;
  const segments = p.split("/");
  for (const s of segments) {
    if (!s || s === "." || s === ".." || s.startsWith(".")) return null;
  }
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  if (!p.includes(".") || !ALLOWED_EXTENSIONS.includes(ext)) return null;
  return p;
}

export type FileSetResult =
  | { ok: true; files: ProjectFile[] }
  | { ok: false; error: string };

/** Validates a whole file set: paths, duplicates, caps, and that index.html exists. */
export function validateFileSet(files: ProjectFile[]): FileSetResult {
  if (!Array.isArray(files) || files.length === 0) return { ok: false, error: "No files." };
  if (files.length > MAX_FILES) return { ok: false, error: `Too many files (max ${MAX_FILES}).` };
  const seen = new Set<string>();
  const out: ProjectFile[] = [];
  let total = 0;
  for (const f of files) {
    const path = normalizePath(f?.path);
    if (!path) return { ok: false, error: `Not an allowed file path: ${String(f?.path).slice(0, 80)}` };
    if (typeof f.content !== "string") return { ok: false, error: `No content for ${path}.` };
    const key = path.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Duplicate file: ${path}` };
    seen.add(key);
    const bytes = Buffer.byteLength(f.content, "utf8");
    if (bytes > MAX_FILE_BYTES) return { ok: false, error: `${path} is too large (max ${MAX_FILE_BYTES / 1000} KB).` };
    total += bytes;
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: `Project is too large (max ${MAX_TOTAL_BYTES / 1_000_000} MB).` };
    out.push({ path, content: f.content });
  }
  if (!seen.has(ENTRY_PATH)) return { ok: false, error: "A project needs an index.html." };
  return { ok: true, files: out };
}

// ---- File-block format ----------------------------------------------------
// The model returns several files as:
//   === FILE: index.html ===
//   ...content...
//   === FILE: styles.css ===
//   ...content...
// A response with no markers is a classic single document.

const BLOCK_MARKER = /^=== (FILE|DELETE): (.+?) ===[ \t]*$/gm;

function stripFence(s: string): string {
  const m = s.match(/^\s*```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  return m ? m[1] : s;
}

export type ParsedBlocks = { files: ProjectFile[]; deleted: string[] };

/**
 * Parses file blocks (and "=== DELETE: path ===" lines, used by edits).
 * Returns null when the text has no markers at all.
 */
export function parseBlocks(text: string): ParsedBlocks | null {
  const matches = Array.from(text.matchAll(BLOCK_MARKER));
  if (matches.length === 0) return null;
  const files: ProjectFile[] = [];
  const deleted: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m[1] === "DELETE") {
      deleted.push(m[2].trim());
      continue;
    }
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const body = stripFence(text.slice(start, end).replace(/^\r?\n/, "").replace(/\s+$/, ""));
    files.push({ path: m[2].trim(), content: body });
  }
  return { files, deleted };
}

/** Parses file blocks. Returns null when the text has no file markers at all. */
export function parseFileBlocks(text: string): ProjectFile[] | null {
  const parsed = parseBlocks(text);
  return parsed && parsed.files.length ? parsed.files : null;
}

/**
 * Applies an edit's changed files and deletions to the existing set. Changed
 * files replace by path (or are added); the result is validated as a whole.
 */
export function applyFileEdit(existing: ProjectFile[], changed: ProjectFile[], deleted: string[]): FileSetResult {
  const map = new Map(existing.map((f) => [f.path, f.content]));
  for (const d of deleted) {
    const p = normalizePath(d);
    if (p && p !== ENTRY_PATH) map.delete(p);
  }
  for (const f of changed) {
    const p = normalizePath(f.path);
    if (!p) return { ok: false, error: `Not an allowed file path: ${String(f.path).slice(0, 80)}` };
    map.set(p, f.content);
  }
  return validateFileSet(Array.from(map, ([path, content]) => ({ path, content })));
}

export function serializeFileBlocks(files: ProjectFile[]): string {
  return files.map((f) => `=== FILE: ${f.path} ===\n${f.content.replace(/\s+$/, "")}\n`).join("\n");
}

/** Relative links in HTML that point at a file the project does not contain. */
export function findMissingLinks(files: ProjectFile[]): string[] {
  const have = new Set(files.map((f) => f.path));
  const missing = new Set<string>();
  for (const f of files) {
    if (!f.path.endsWith(".html")) continue;
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
    for (const m of Array.from(f.content.matchAll(/(?:src|href)=["']([^"'#?]+)(?:[?#][^"']*)?["']/gi))) {
      const ref = m[1];
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|data:|mailto:|tel:)/i.test(ref)) continue;
      const parts = (dir + ref).split("/");
      const stack: string[] = [];
      for (const part of parts) {
        if (part === "..") stack.pop();
        else if (part && part !== ".") stack.push(part);
      }
      const resolved = stack.join("/");
      const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) continue; // images etc. are not stored
      if (!have.has(resolved)) missing.add(resolved);
    }
  }
  return Array.from(missing);
}

/** Files GYSM writes to the repo itself; they are not part of the project unless it has its own. */
export const GENERATED_REPO_PATHS = ["vercel.json", "README.md"];

/**
 * Which repo paths a pull should load into a multi-file project. Anything that
 * is not an allowed project path is ignored; GYSM's generated vercel.json and
 * README.md are skipped unless the project already has files of that name.
 */
export function selectPullPaths(repoPaths: string[], currentPaths: string[]): string[] {
  const have = new Set(currentPaths);
  const out: string[] = [];
  for (const raw of repoPaths) {
    const p = normalizePath(raw);
    if (!p) continue;
    if (GENERATED_REPO_PATHS.includes(p) && !have.has(p)) continue;
    out.push(p);
  }
  return out.slice(0, MAX_FILES);
}

/** True when two file sets hold the same paths with the same content. */
export function sameFileSet(a: ProjectFile[], b: ProjectFile[]): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((f) => [f.path, f.content.trim()]));
  return b.every((f) => map.get(f.path) === f.content.trim());
}
