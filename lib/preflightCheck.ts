// Automated pre-publish check -- a lightweight, dependency-free static
// scan of a generated build's HTML, run automatically right after
// generation/edit (see app/api/generate/route.ts) and on demand via
// /api/projects/[id]/check. This is deliberately NOT an autonomous
// testing agent that runs the app and fixes what it finds (that's a much
// bigger feature) -- it's an honest, fast structural scan for the most
// common failure modes seen in AI-generated HTML: truncated output,
// unbalanced tags, dead internal links, obvious placeholder content, and
// missing alt text. Results are informational (never block publishing),
// shown as a small trust badge on /publish pages.

export type PreflightIssue = {
  type: "truncated" | "unbalanced_tags" | "broken_anchor" | "placeholder_text" | "missing_alt";
  message: string;
  detail?: string;
};

export type PreflightResult = {
  status: "pass" | "warnings";
  issues: PreflightIssue[];
  checkedAt: string;
};

const PLACEHOLDER_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /lorem ipsum/i, label: "Lorem ipsum placeholder text" },
  { re: /\btodo\b:?/i, label: "\"TODO\" placeholder text" },
  { re: /feature description goes here/i, label: "Unfilled feature description placeholder" },
  { re: /\[insert[^\]]*\]/i, label: "\"[insert ...]\" placeholder" },
  { re: /\byour text here\b/i, label: "\"Your text here\" placeholder" },
];

function countOccurrences(haystack: string, needle: RegExp): number {
  const m = haystack.match(needle);
  return m ? m.length : 0;
}

function checkTagBalance(html: string, tag: string): number | null {
  const open = countOccurrences(html, new RegExp(`<${tag}(\\s[^>]*)?>`, "gi"));
  const close = countOccurrences(html, new RegExp(`</${tag}>`, "gi"));
  return open === close ? null : open - close;
}

export function runPreflightCheck(html: string): PreflightResult {
  const issues: PreflightIssue[] = [];
  const trimmed = html.trim();

  // 1. Truncation -- the single most common real failure mode for a
  // one-shot AI generation (hit a token limit mid-document).
  if (!/^<!DOCTYPE html>/i.test(trimmed)) {
    issues.push({ type: "truncated", message: "Document doesn't start with <!DOCTYPE html> -- output may be malformed." });
  }
  if (!/<\/html>\s*$/i.test(trimmed)) {
    issues.push({ type: "truncated", message: "Document doesn't end with </html> -- generation may have been cut off." });
  }

  // 2. Structural tag balance for the three tags most likely to break
  // the whole page visually or functionally if mismatched.
  for (const tag of ["div", "script", "style"]) {
    const diff = checkTagBalance(trimmed, tag);
    if (diff !== null) {
      issues.push({
        type: "unbalanced_tags",
        message: `Unbalanced <${tag}> tags (${diff > 0 ? `${diff} unclosed` : `${-diff} extra closing tag(s)`}).`,
      });
    }
  }

  // 3. Dead in-page anchors -- href="#something" with no matching id.
  const anchorTargets = Array.from(trimmed.matchAll(/href=["']#([\w-]+)["']/gi)).map((m) => m[1]);
  if (anchorTargets.length) {
    const ids = new Set(Array.from(trimmed.matchAll(/\bid=["']([\w-]+)["']/gi)).map((m) => m[1]));
    const missing = Array.from(new Set(anchorTargets)).filter((t) => t && !ids.has(t));
    if (missing.length) {
      issues.push({
        type: "broken_anchor",
        message: `${missing.length} in-page link${missing.length > 1 ? "s" : ""} point to a section that doesn't exist.`,
        detail: missing.slice(0, 5).map((m) => `#${m}`).join(", "),
      });
    }
  }
  const emptyAnchors = countOccurrences(trimmed, /href=["'](#|)["']/gi);
  if (emptyAnchors > 0) {
    issues.push({ type: "broken_anchor", message: `${emptyAnchors} link${emptyAnchors > 1 ? "s" : ""} with an empty href="".` });
  }

  // 4. Obvious placeholder content that shipped instead of real copy.
  for (const { re, label } of PLACEHOLDER_PATTERNS) {
    if (re.test(trimmed)) {
      issues.push({ type: "placeholder_text", message: label });
    }
  }

  // 5. Missing alt text -- accessibility + a common sign of a rushed
  // generation.
  const imgs = Array.from(trimmed.matchAll(/<img\b[^>]*>/gi));
  const missingAlt = imgs.filter((m) => !/\balt=["'][^"']*["']/i.test(m[0])).length;
  if (missingAlt > 0) {
    issues.push({ type: "missing_alt", message: `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text.` });
  }

  return {
    status: issues.length ? "warnings" : "pass",
    issues,
    checkedAt: new Date().toISOString(),
  };
}
