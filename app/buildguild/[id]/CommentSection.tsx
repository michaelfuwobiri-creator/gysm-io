"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const CommentComposer = dynamic(() => import("./CommentComposer"), { ssr: false });

type Comment = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

// Client-side discussion thread for one BuildGuild app. Loads existing
// comments on mount, posts new ones via /api/projects/[id]/comments
// (auth-gated server-side). The auth-dependent composer footer lives in
// its own component (CommentComposer.tsx), loaded with ssr:false -- see
// app/components/NavAuthLink.tsx for why calling useUser() from anything
// that participates in SSR isn't safe here, confirmed live across three
// unrelated pages regardless of static/dynamic rendering or how the
// mounted/isLoaded/isSignedIn branch itself was written.
export default function CommentSection({ projectId }: { projectId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");

  // Guideline 1.2: report objectionable comments, and block abusive users.
  async function reportComment(id: string) {
    const reason = window.prompt("What's wrong with this comment? (optional)") ?? null;
    if (reason === null) return;
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "comment", targetId: id, reason }),
    });
    setNote(res.ok ? "Thanks. We'll review this report within 24 hours." : res.status === 401 ? "Sign in to report content." : "Couldn't submit the report.");
  }

  async function blockAuthor(id: string) {
    if (!window.confirm("Block this user? You won't see their comments any more.")) return;
    const res = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId: id }),
    });
    if (res.ok) {
      setComments((prev) => prev.filter((c) => c.id !== id));
      setNote("User blocked.");
    } else {
      setNote(res.status === 401 ? "Sign in to block users." : "Couldn't block this user.");
    }
  }

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
              <div className="mt-1 flex gap-3 text-[11px] opacity-40">
                <button onClick={() => reportComment(c.id)} className="hover:opacity-100 underline">Report</button>
                <button onClick={() => blockAuthor(c.id)} className="hover:opacity-100 underline">Block user</button>
              </div>
            </div>
          ))
        )}
      </div>

      {note && <p className="mt-3 text-[12px] text-black/60">{note}</p>}

      <div className="mt-4 pt-4 border-t border-black/5">
        <CommentComposer projectId={projectId} onPosted={(c) => setComments((prev) => [...prev, c])} />
      </div>
    </div>
  );
}
