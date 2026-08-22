"use client";

import { useState } from "react";
import { useUser, SignInButton } from "@clerk/nextjs";

type Comment = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

// The one auth-dependent piece of CommentSection.tsx -- split out so it can
// be loaded via next/dynamic(..., { ssr: false }) from the parent. See
// app/components/NavAuthLink.tsx for why: calling @clerk/nextjs's
// useUser() from any component that participates in SSR throws React
// hydration errors (#418/#423/#425) regardless of how the returned value
// is used in render -- confirmed across three unrelated pages (this one,
// the homepage nav, /pricing's CheckoutButton). ssr:false means this
// component never renders on the server, so there's nothing for its first
// client render to mismatch against.
export default function CommentComposer({
  projectId,
  onPosted,
}: {
  projectId: string;
  onPosted: (comment: Comment) => void;
}) {
  const { isLoaded, isSignedIn } = useUser();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onPosted(data.comment);
      setDraft("");
    } catch {
      setError("Failed to post comment. Check your connection and try again.");
    } finally {
      setPosting(false);
    }
  }

  if (!isLoaded) return null;

  return isSignedIn ? (
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
  );
}
