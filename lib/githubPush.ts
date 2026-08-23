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
