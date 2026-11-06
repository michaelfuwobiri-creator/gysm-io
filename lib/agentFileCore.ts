// Pure helpers for send_file: handing the user a file the agent made.

export const MAX_SEND_FILE_BYTES = 1_500_000;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Content type for a download, by extension. Unknown types become a generic binary download. */
export function mimeForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return MIME[ext] || "application/octet-stream";
}

/** The file name the user sees: last path segment, safe characters only. */
export function downloadName(path: string, wanted?: unknown): string {
  const pick = typeof wanted === "string" && wanted.trim() ? wanted : path;
  const base = pick.replace(/\\/g, "/").split("/").pop() || "download";
  return base.normalize("NFKD").replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/^[-. ]+/, "").slice(-80) || "download";
}
