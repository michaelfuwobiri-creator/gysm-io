"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HEARTBEAT_MS, MAX_COMMENT_CHARS, initialsOf, type Viewer } from "@/lib/collabCore";

type Comment = { id: string; author_name: string; body: string; created_at: string; mine: boolean };

function when(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

// Presence + private-build comments for the build open in the builder. The
// heartbeat runs whenever a saved build is open and the tab is visible; the
// comment thread loads when the popover is opened. Both degrade quietly if the
// server says the feature isn't enabled yet.
export default function TeamPanel({ projectId }: { projectId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [ready, setReady] = useState(true);
  const [notReadyMsg, setNotReadyMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Heartbeat
  useEffect(() => {
    let stopped = false;
    async function ping() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/projects/${projectId}/collab/presence`, { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped) return;
        if (data.ready === false) setReady(false);
        else setViewers(Array.isArray(data.viewers) ? data.viewers : []);
      } catch {
        /* offline: keep the last list */
      }
    }
    ping();
    const timer = setInterval(ping, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && ping();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [projectId]);

  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/collab/comments`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't load comments.");
        return;
      }
      if (data.ready === false) {
        setReady(false);
        setNotReadyMsg(data.message || "");
        return;
      }
      setReady(true);
      setError("");
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      setError("Couldn't load comments.");
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    loadComments();
    const timer = setInterval(loadComments, 15_000);
    return () => clearInterval(timer);
  }, [open, loadComments]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, comments.length]);

  async function post() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/collab/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't post.");
        return;
      }
      setComments((c) => [...c, data.comment]);
      setDraft("");
    } catch {
      setError("Couldn't post.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    setComments((c) => c.filter((x) => x.id !== id));
    try {
      await fetch(`/api/projects/${projectId}/collab/comments?commentId=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      loadComments();
    }
  }

  const others = viewers.filter((v) => !v.you);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white px-1.5"
        title={others.length ? `Also here: ${others.map((v) => v.name).join(", ")}` : "Team comments"}
      >
        {others.length > 0 && (
          <span className="flex -space-x-1.5">
            {others.slice(0, 3).map((v, i) => (
              <span
                key={i}
                className="h-4 w-4 rounded-full bg-[#FF0080]/80 text-[8px] leading-4 text-center text-white ring-1 ring-[#0f0f14]"
              >
                {initialsOf(v.name)}
              </span>
            ))}
          </span>
        )}
        Team{comments.length > 0 ? ` (${comments.length})` : ""}
      </button>

      {open && (
        <div className="absolute right-3 top-14 z-30 w-[320px] max-h-[70vh] flex flex-col rounded-xl border border-white/10 bg-[#15151c] shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
            <span className="text-[12px] text-white/80">Comments</span>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-[14px] leading-none">
              &times;
            </button>
          </div>
          <div className="px-3 py-2 border-b border-white/8 text-[11px] text-white/50">
            {viewers.length === 0
              ? "Nobody else is here right now."
              : others.length === 0
              ? "Only you are here right now."
              : `Here now: ${viewers.map((v) => (v.you ? "You" : v.name)).join(", ")}`}
          </div>
          <div ref={listRef} className="flex-1 min-h-[80px] overflow-y-auto px-3 py-2 space-y-2.5">
            {!ready ? (
              <p className="text-[11px] text-white/40">
                {notReadyMsg || "Team comments aren't enabled on this deployment yet."}
              </p>
            ) : comments.length === 0 ? (
              <p className="text-[11px] text-white/40">
                No comments yet. Anyone who can open this build (you, or your organization) can read and add to this thread.
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-white/80">{c.mine ? "You" : c.author_name}</span>
                    <span className="flex items-center gap-2 text-[10px] text-white/30">
                      {when(c.created_at)}
                      {c.mine && (
                        <button onClick={() => remove(c.id)} className="hover:text-white/70">
                          Delete
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="text-white/60 whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              ))
            )}
          </div>
          {ready && (
            <div className="border-t border-white/8 p-2">
              {error && <p className="text-[11px] text-red-400 mb-1">{error}</p>}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    post();
                  }
                }}
                rows={2}
                placeholder="Leave a note for your team…"
                className="w-full resize-none rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-white/30">Ctrl/Cmd+Enter to post</span>
                <button
                  onClick={post}
                  disabled={!draft.trim() || posting}
                  className="rounded-lg bg-[#FF0080] text-white text-[11px] px-2.5 py-1 disabled:opacity-40"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
