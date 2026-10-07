import { runPreflightCheck, type PreflightIssue, type PreflightResult } from "./preflightCheck";
import { scanForSecrets } from "./secretScan";
import { findMissingLinks, ENTRY_PATH, type ProjectFile } from "./projectFilesCore";

/**
 * Preflight for a whole project: the existing HTML check on index.html, plus
 * a secret scan of every other file and a check that relative links point at
 * files that exist. Single-file builds get exactly the old result.
 */
export function runProjectPreflight(files: ProjectFile[]): PreflightResult {
  const entry = files.find((f) => f.path === ENTRY_PATH);
  const base = runPreflightCheck(entry?.content ?? "");
  const issues: PreflightIssue[] = [...base.issues];

  for (const f of files) {
    if (f.path === ENTRY_PATH) continue;
    for (const s of scanForSecrets(f.content)) {
      issues.push({
        type: "exposed_secret",
        message:
          s.severity === "high"
            ? `${s.label} found in ${f.path} -- remove it and rotate the key.`
            : `Possible ${s.label.toLowerCase()} in ${f.path} -- check it is meant to be public.`,
        detail: s.preview,
      });
    }
  }

  for (const missing of findMissingLinks(files)) {
    issues.push({ type: "missing_file", message: `A page links to ${missing}, which is not in the project.` });
  }

  return { status: issues.length ? "warnings" : "pass", issues, checkedAt: base.checkedAt };
}
