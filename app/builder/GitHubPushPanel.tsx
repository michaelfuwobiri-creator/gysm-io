"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  owner?: string;
  repo?: string;
  branch?: string;
  status?: string;
  error_message?: string | null;
  last_pushed_at?: string | null;
  last_commit_url?: string | null;
};

// Standalone modal (not one of BuilderClient's inline expand-in-place
// toolbar panels) so wiring this in touches BuilderClient.tsx minimally --
// one button, one bit of open/close state. See app/api/github/* for the
// PAT-based connect/push/disconnect this drives, and lib/githubPush.ts
// for why a pasted token instead of an OAuth App.
export default function GitHubPushPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/github/status?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        if (data.connected) {
          setOwner(data.owner || "");
          setRepo(data.repo || "");
          setBranch(data.branch || "main");
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function connect() {
    if (!token.trim() || !owner.trim() || !repo.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, token: token.trim(), owner: owner.trim(), repo: repo.trim(), branch: branch.trim() || "main" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect.");
        return;
      }
      setToken("");
      setStatus({ connected: true, owner: data.owner, repo: data.repo, branch: data.branch, status: "connected" });
    } catch {
      setError("Failed to connect. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function push() {
    if (pushing) return;
    setPushing(true);
    setError("");
    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Push failed.");
        return;
      }
      setStatus((prev) => (prev ? { ...prev, last_pushed_at: new Date().toISOString(), last_commit_url: data.commitUrl } : prev));
    } catch {
      setError("Push failed. Check your connection and try again.");
    } finally {
      setPushing(false);
    }
  }

  async function disconnect() {
    await fetch("/api/github/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setStatus({ connected: false });
    setOwner("");
    setRepo("");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-black/10 shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-black tracking-tight">Push to GitHub</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-black/45 text-[13px] mb-4">
          Syncs this build to a repo you own, using a token you paste in -- not a GYSM login. Re-run any time to push your latest changes as a new commit.
        </p>

        {loading ? (
          <div className="text-black/40 text-sm py-6 text-center">Loading…</div>
        ) : status?.connected ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px]">
              <div className="font-bold text-emerald-700">
                {status.owner}/{status.repo}
                <span className="text-emerald-600/60 font-medium"> @ {status.branch}</span>
              </div>
              {status.last_pushed_at && (
                <div className="text-emerald-700/70 mt-1">
                  Last pushed {new Date(status.last_pushed_at).toLocaleString()}
                  {status.last_commit_url && (
                    <>
                      {" -- "}
                      <a href={status.last_commit_url} target="_blank" rel="noopener noreferrer" className="underline">
                        view commit
                      </a>
                    </>
                  )}
                </div>
              )}
              {!status.last_pushed_at && <div className="text-emerald-700/60 mt-1">Not pushed yet.</div>}
            </div>
            {error && <div className="text-red-600 text-[13px]">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={push}
                disabled={pushing}
                className="flex-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
              >
                {pushing ? "Pushing…" : "Push now"}
              </button>
              <button
                onClick={disconnect}
                className="py-2.5 px-4 rounded-full border border-black/15 text-black/60 text-[13px] font-bold hover:bg-black/5 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <label className="text-[12px] font-bold text-black/50">
              Personal access token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_… (Contents: read and write on the target repo)"
                className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-[12px] font-bold text-black/50">
                Owner
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="your-username"
                  className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                />
              </label>
              <label className="flex-1 text-[12px] font-bold text-black/50">
                Repo
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="my-app"
                  className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                />
              </label>
            </div>
            <label className="text-[12px] font-bold text-black/50">
              Branch
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
              />
            </label>
            {error && <div className="text-red-600 text-[13px]">{error}</div>}
            <button
              onClick={connect}
              disabled={saving || !token.trim() || !owner.trim() || !repo.trim()}
              className="mt-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
            >
              {saving ? "Connecting…" : "Connect & verify"}
            </button>
            <p className="text-black/30 text-[11px]">
              Create a fine-grained token at github.com/settings/personal-access-tokens/new, scoped to just this repo with "Contents: read and write".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
