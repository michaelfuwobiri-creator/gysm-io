// Pure helpers for "Pull from GitHub": decide whether a file fetched from
// the connected repo is safe to load into a GYSM build. Kept free of
// network and database code so it can be unit tested.

/** Largest index.html we will load into a build. */
export const MAX_PULL_BYTES = 2 * 1024 * 1024;

export type PullValidation = { ok: true } | { ok: false; error: string };

export function validatePulledHtml(html: string): PullValidation {
  const trimmed = (html ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "index.html in the repo is empty." };
  }
  if (Buffer.byteLength(trimmed, "utf8") > MAX_PULL_BYTES) {
    return { ok: false, error: "index.html in the repo is larger than 2 MB, which GYSM can't load." };
  }
  if (!/^<!doctype html/i.test(trimmed)) {
    return {
      ok: false,
      error: "index.html in the repo doesn't start with <!DOCTYPE html>, so it isn't a complete page GYSM can load.",
    };
  }
  if (!/<\/html>\s*$/i.test(trimmed)) {
    return { ok: false, error: "index.html in the repo doesn't end with </html>, so it looks cut off." };
  }
  return { ok: true };
}
