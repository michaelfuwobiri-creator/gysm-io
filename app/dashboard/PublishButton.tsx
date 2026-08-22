"use client";

import { useState } from "react";

type Props = {
  projectId: string;
  initialIsPublic: boolean;
  initialTitle: string;
  defaultTitle: string;
};

// Dashboard-card version of the builder's "Share to BuildGuild" flow --
// same /api/projects/[id]/publish route, just a compact inline form so it
// fits in a project card instead of the full builder toolbar.
export default function PublishButton({ projectId, initialIsPublic, initialTitle, defaultTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [published, setPublished] = useState(initialIsPublic);
  const [title, setTitle] = useState(initialTitle || defaultTitle);
  const [tagline, setTagline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function publish() {
    if (!title.trim() || publishing) return;
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), tagline: tagline.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to publish.");
        return;
      }
      setPublished(true);
      setOpen(false);
    } catch {
      setError("Failed to publish. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <a
        href={`/buildguild/${projectId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-center px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold"
      >
        Live on BuildGuild
      </a>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-center px-3 py-2 rounded-lg bg-fuchsia-600 text-white text-xs font-bold"
      >
        Share to BuildGuild
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 p-3 rounded-lg bg-black/[0.03] border border-black/10">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={120}
            className="w-full h-8 px-3 rounded-full bg-white border border-black/10 text-black text-[12px] outline-none"
          />
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Tagline (optional)"
            maxLength={200}
            className="w-full h-8 px-3 rounded-full bg-white border border-black/10 text-black text-[12px] outline-none"
          />
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <button
            onClick={publish}
            disabled={!title.trim() || publishing}
            className="px-3 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      )}
    </div>
  );
}
