"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toThumbnailHtml } from "@/lib/thumbnailHtml";

export type BuildCardApp = {
  id: string;
  title: string | null;
  tagline: string | null;
  publisher_name: string | null;
  published_at: string;
  html: string;
  views: number;
  comment_count: number;
  tags: string[];
};

// Masonry card with a hover overlay (View / Clone) over the live preview
// thumbnail -- matches the pasted "Build Gang" reference design's card
// treatment. "Clone" reuses the exact same /api/projects/[id]/remix call
// as the detail page's RemixButton (see app/buildguild/[id]/RemixButton.tsx)
// so it's real functionality, not a decorative button.
export default function BuildCard({ app, timeAgo }: { app: BuildCardApp; timeAgo: string }) {
  const router = useRouter();
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");

  async function clone(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (cloning) return;
    setCloning(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${app.id}/remix`, { method: "POST" });
      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=/buildguild/${app.id}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to clone.");
        setCloning(false);
        return;
      }
      router.push(`/builder?projectId=${data.id}`);
    } catch {
      setError("Failed to clone.");
      setCloning(false);
    }
  }

  return (
    <a
      href={`/buildguild/${app.id}`}
      className="group mb-5 block break-inside-avoid rounded-[20px] bg-white/[0.04] border border-white/10 overflow-hidden hover:border-[#FF0080]/40 hover:bg-white/[0.06] transition"
    >
      <div className="relative h-[160px] bg-[#0e0e11] overflow-hidden border-b border-white/10">
        <iframe
          srcDoc={toThumbnailHtml(app.html)}
          className="w-full h-full border-0 scale-100 pointer-events-none"
          sandbox="allow-scripts allow-same-origin"
          title={app.title || "Published app"}
          tabIndex={-1}
          scrolling="no"
        />
        {/* Hover overlay -- View / Clone, matching the pasted reference
            design. Sits on top of the (pointer-events-none) iframe so
            clicks always land on these buttons, never inside the preview. */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="h-8 px-4 rounded-full bg-white text-[#08080a] text-[12px] font-bold grid place-items-center">
            View
          </span>
          <button
            onClick={clone}
            disabled={cloning}
            className="h-8 px-4 rounded-full bg-[#FF0080] text-white text-[12px] font-bold grid place-items-center disabled:opacity-50"
          >
            {cloning ? "Cloning…" : "Clone"}
          </button>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        <div className="font-bold text-[14px] line-clamp-1">{app.title || "Untitled build"}</div>
        {app.tagline && <div className="text-[12px] text-white/50 line-clamp-2">{app.tagline}</div>}
        {app.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {app.tags.map((t) => (
              <span key={t} className="h-5 px-2 rounded-full bg-white/[0.06] text-white/50 text-[10px] font-semibold grid place-items-center">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <div className="text-[11px] text-white/35">
            by {app.publisher_name || "a GYSM builder"} · {timeAgo}
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-white/35 shrink-0">
            <span title="Views">👁 {app.views || 0}</span>
            {app.comment_count > 0 && <span title="Comments">💬 {app.comment_count}</span>}
          </div>
        </div>
        {error && <div className="text-[11px] text-red-400 mt-1">{error}</div>}
      </div>
    </a>
  );
}
