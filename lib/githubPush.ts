// "Push to GitHub" -- ongoing sync for a build, via a user-pasted
// fine-grained personal access token rather than a registered GitHub
// OAuth App. Voiie (app/api/projects/[id]/vercel-export/route.ts) already
// set the honesty bar for this category: no fake OAuth automation, no
// GYSM login step in the middle. A PAT the user generates themselves
// (github.com/settings/personal-access-tokens/new, "Contents: read and
// write" on the one target repo) needs zero setup on GYSM's side and
// keeps the same "we're not pretending to be more integrated than we
// are" posture. Token is encrypted at rest (lib/crypto.ts) and only ever
// decrypted server-side.

import { MAX_PULL_BYTES } from "./githubPull";

const API_BASE = "https://api.github.com";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function verifyGithubAccess(token: string, owner: string, repo: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (res.status === 404) {
    return { ok: false, error: `Repo ${owner}/${repo} not found (or this token can't see it -- check the repo exists and the token has access to it).` };
  }
  if (res.status === 401) {
    return { ok: false, error: "That token was rejected by GitHub. Check it's correct and hasn't expired." };
  }
  if (!res.ok) {
    return { ok: false, error: `GitHub returned an error (${res.status}). Please try again.` };
  }
  const json = await res.json();
  if (json?.permissions?.push === false) {
    return { ok: false, error: "This token doesn't have write access to that repo. Regenerate it with \"Contents: read and write\" permission." };
  }
  return { ok: true };
}

async function getFileSha(token: string, owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
    headers: headers(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const json = await res.json();
  return json?.sha ?? null;
}

export type PushFile = { path: string; content: string };

export type PushResult = { ok: true; commitUrls: string[] } | { ok: false; error: string };

/** Creates or updates each file via the GitHub Contents API -- one commit per file (simple and reliable; a single-file static build rarely needs an atomic multi-file commit, and the Contents API needs no git plumbing beyond a token). */
export async function pushFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: PushFile[],
  message: string
): Promise<PushResult> {
  const commitUrls: string[] = [];
  for (const file of files) {
    try {
      const sha = await getFileSha(token, owner, repo, branch, file.path);
      const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`, {
        method: "PUT",
        headers: headers(token),
        body: JSON.stringify({
          message,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Failed to push ${file.path} (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = await res.json();
      if (json?.commit?.html_url) commitUrls.push(json.commit.html_url);
    } catch (error: any) {
      return { ok: false, error: `Failed to push ${file.path}: ${error.message}` };
    }
  }
  return { ok: true, commitUrls };
}

export type FetchFileResult = { ok: true; content: string } | { ok: false; error: string; notFound?: boolean };

/** Reads one text file from the repo (raw contents, so files over 1 MB still work). */
export async function fetchFileText(token: string, owner: string, repo: string, branch: string, path: string): Promise<FetchFileResult> {
  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
      headers: { ...headers(token), Accept: "application/vnd.github.raw+json" },
    });
    if (res.status === 404) {
      return { ok: false, notFound: true, error: `${path} was not found on branch ${branch}. Push from GYSM first, or check the branch name.` };
    }
    if (res.status === 401) return { ok: false, error: "That token was rejected by GitHub. Reconnect GitHub for this build." };
    if (!res.ok) return { ok: false, error: `GitHub returned an error (${res.status}). Please try again.` };
    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_PULL_BYTES) return { ok: false, error: `${path} in the repo is larger than 2 MB, which GYSM can't load.` };
    return { ok: true, content: await res.text() };
  } catch (error: any) {
    return { ok: false, error: `Could not reach GitHub: ${error.message}` };
  }
}

export type ListFilesResult = { ok: true; paths: string[]; truncated: boolean } | { ok: false; error: string };

/** Lists file paths on a branch (one API call, recursive). */
export async function listRepoFiles(token: string, owner: string, repo: string, branch: string): Promise<ListFilesResult> {
  try {
    const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
      headers: headers(token),
    });
    if (res.status === 401) return { ok: false, error: "That token was rejected by GitHub. Reconnect GitHub for this build." };
    if (!res.ok) return { ok: false, error: `GitHub returned an error (${res.status}). Please try again.` };
    const json = await res.json();
    const paths = (Array.isArray(json?.tree) ? json.tree : [])
      .filter((t: any) => t?.type === "blob" && typeof t.path === "string")
      .map((t: any) => t.path as string);
    return { ok: true, paths, truncated: !!json?.truncated };
  } catch (error: any) {
    return { ok: false, error: `Could not reach GitHub: ${error.message}` };
  }
}
