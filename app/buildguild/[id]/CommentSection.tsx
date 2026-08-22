"use client";

import { useEffect, useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

type Comment = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

// Client-side discussion thread for one BuildGuild app. Loads existing
// comments on mount, posts new ones via /api/projects/[id]/comments
// (auth-gated server-side -- the SignInButton fallback here is just UX,
// not the actual gate).
export default function CommentSection({ projectId }: { projectId: string }) {
  // middleware.ts runs clerkMiddleware on every request, so Clerk embeds
  // the real auth state into the SSR payload -- isLoaded/isSignedIn are
  // already correct on the very first render, matching between server
  // and client with no async resolution gap to guard against (see the
  // longer note in app/page.tsx, which had the same unnecessary gate
  // causing its own hydration mismatch for signed-in visitors).
  const { isLoaded, isSignedIn } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setComments(data.comments || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function submit() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to post comment.");
        return;
      }
      setComments((prev) => [...prev, data.comment]);
      setDraft("");
    } catch {
      setError("Failed to post comment. Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-black/5 bg-white p-5 h-fit lg:sticky lg:top-[80px]">
      <h2 className="font-black text-[15px] mb-4">Discussion {comments.length > 0 && `(${comments.length})`}</h2>

      <div className="flex flex-col gap-4 max-h-[420px] overflow-y-auto pr-1">
        {loading ? (
          <p className="text-[13px] opacity-40">Loading comments…</p>
        ) : comments.length === 0 ? (
          <p className="text-[13px] opacity-40">No comments yet — be the first to say something.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-bold">{c.author_name}</span>
                <span className="opacity-40 text-[11px]">
                  {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
              <p className="mt-0.5 opacity-70 leading-relaxed whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-black/5">
        {!isLoaded ? null : isSignedIn ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share feedback or ask a question…"
              rows={3}
              className="w-full text-[13px] rounded-[12px] border border-black/10 p-3 resize-none focus:outline-none focus:border-black/30"
            />
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            <button
              onClick={submit}
              disabled={!draft.trim() || posting}
              className="self-end px-4 py-2 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-40"
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </div>
        ) : (
          <SignInButton mode="modal">
            <button className="w-full px-4 py-2.5 rounded-full border border-black/10 text-[13px] font-semibold hover:bg-black/[0.02]">
              Sign in to join the discussion
            </button>
          </SignInButton>
        )}
      </div>
    </div>
  );
}
