// Builds a self-contained preview of a static site for the Agent's Preview
// panel. The files come from the user's workspace; the result is one HTML
// string for a sandboxed iframe (srcdoc), with stylesheets, scripts, images
// and CSS url() references inlined so nothing needs a server.

export type PreviewFile = { path: string; text?: string; base64?: string };

const MIME: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript",
  json: "application/json", svg: "image/svg+xml", txt: "text/plain", md: "text/markdown", xml: "application/xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", mp3: "audio/mpeg",
  mp4: "video/mp4", webm: "video/webm",
};
const TEXT_EXT = new Set(["html", "htm", "css", "js", "mjs", "json", "svg", "txt", "md", "xml"]);

export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "";
}
export function mimeFor(path: string): string {
  return MIME[extOf(path)] || "application/octet-stream";
}
export function isTextPath(path: string): boolean {
  return TEXT_EXT.has(extOf(path));
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Resolves a reference found in `fromDir` to a project-relative path. Null for external, data:, mailto: and hash-only refs. */
export function resolveRef(fromDir: string, ref: string): string | null {
  let r = ref.trim();
  if (!r || r.startsWith("#") || r.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(r)) return null;
  r = r.split("#")[0].split("?")[0];
  if (!r) return null;
  const parts: string[] = r.startsWith("/") ? [] : fromDir.split("/").filter(Boolean);
  for (const seg of r.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(decodeURIComponent(seg));
  }
  return parts.join("/") || null;
}

function toDataUri(file: PreviewFile): string {
  const mime = mimeFor(file.path);
  if (file.base64 !== undefined) return `data:${mime};base64,${file.base64}`;
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(file.text ?? ""))) : Buffer.from(file.text ?? "", "utf8").toString("base64");
  return `data:${mime};base64,${b64}`;
}

function inlineCssUrls(css: string, dir: string, byPath: Map<string, PreviewFile>): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, _q, ref) => {
    const p = resolveRef(dir, ref);
    const f = p ? byPath.get(p) : undefined;
    return f ? `url("${toDataUri(f)}")` : whole;
  });
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};

const NAV_SCRIPT = `<script>document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(!h||h.charAt(0)==='#'||/^[a-z][a-z0-9+.-]*:/i.test(h)||h.indexOf('//')===0)return;e.preventDefault();parent.postMessage({gysmPreviewNav:h},'*')},true);</script>`;

export type Bundle = { ok: true; html: string; entry: string; pages: string[] } | { ok: false; error: string };

/** Picks the page to show: the requested one, index.html, or the first page. */
export function pickEntry(files: PreviewFile[], wanted?: string): string | null {
  const pages = files.map((f) => f.path).filter((p) => /\.html?$/i.test(p));
  if (wanted && pages.includes(wanted)) return wanted;
  return pages.find((p) => /^index\.html?$/i.test(p)) || pages.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0] || null;
}

export function bundlePreview(files: PreviewFile[], wanted?: string): Bundle {
  const entry = pickEntry(files, wanted);
  if (!entry) return { ok: false, error: "There is no web page (.html file) in this project yet, so there is nothing to preview." };
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  const dir = dirOf(entry);
  let html = byPath.get(entry)?.text ?? "";

  // <link rel="stylesheet" href> -> <style>, <link rel="icon"> -> data URI
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = attr(tag, "href");
    const rel = (attr(tag, "rel") || "").toLowerCase();
    const p = href ? resolveRef(dir, href) : null;
    const f = p ? byPath.get(p) : undefined;
    if (!f) return tag;
    if (rel.includes("stylesheet") && f.text !== undefined) return `<style>${inlineCssUrls(f.text, dirOf(f.path), byPath).replace(/<\/style/gi, "<\\/style")}</style>`;
    if (rel.includes("icon")) return tag.replace(/(\shref\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${toDataUri(f)}"`);
    return tag;
  });

  // <script src> -> inline script
  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (whole, attrs: string) => {
    const src = attr(`<script ${attrs}>`, "src");
    const p = src ? resolveRef(dir, src) : null;
    const f = p ? byPath.get(p) : undefined;
    if (!f || f.text === undefined) return whole;
    const rest = attrs.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<script${rest}>${f.text.replace(/<\/script/gi, "<\\/script")}</script>`;
  });

  // images, media, posters
  html = html.replace(/<(img|source|video|audio)\b[^>]*>/gi, (tag) => {
    let out = tag;
    for (const name of ["src", "poster"]) {
      const v = attr(tag, name);
      const p = v ? resolveRef(dir, v) : null;
      const f = p ? byPath.get(p) : undefined;
      if (f) out = out.replace(new RegExp(`(\\s${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "i"), `$1"${toDataUri(f)}"`);
    }
    return out;
  });

  // CSS url() inside <style> blocks and style="" attributes
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_w, a, css, c) => `${a}${inlineCssUrls(css, dir, byPath)}${c}`);
  html = html.replace(/(\sstyle\s*=\s*)"([^"]*)"/gi, (_w, a, css) => `${a}"${inlineCssUrls(css, dir, byPath).replace(/"/g, "&quot;")}"`);

  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${NAV_SCRIPT}</body>`) : html + NAV_SCRIPT;
  const pages = files.map((f) => f.path).filter((p) => /\.html?$/i.test(p)).sort();
  return { ok: true, html, entry, pages };
}
