"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUILD_TAGS, MAX_TAGS_PER_BUILD } from "@/lib/buildTags";

type MyProject = {
  id: string;
  prompt: string;
  name: string | null;
  title: string | null;
  tagline: string | null;
  is_public: boolean;
  tags: string[] | null;
  created_at: string;
};

// One row in the Submit Build modal's list -- already-published builds
// link straight to their live BuildGuild page; unpublished ones expand
// into the same title/tagline/tags mini-form PublishButton.tsx uses on
// the dashboard, POSTing to the same real /api/projects/[id]/publish
// endpoint. No separate/fake submission pipeline.
function ProjectRow({ project, onPublished }: { project: MyProject; onPublished: () => void }) {
  const label = project.title || project.name || project.prompt.slice(0, 60);
  const [title, setTitle] = useState(project.title || project.name || project.prompt.slice(0, 60));
  const [tagline, setTagline] = useState(project.tagline || "");
  const [tags, setTags] = useState<string[]>(project.tags || []);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (project.is_public) {
    return (
      <a
        href={`/buildguild/${project.id}`}
        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06]"
      >
        <span className="text-[13px] text-white/80 truncate">{label}</span>
        <span className="text-[11px] text-emerald-400 font-semibold shrink-0">Live &#8594;</span>
      </a>
    );
  }

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length >= MAX_TAGS_PER_BUILD ? prev : [...prev, tag]
    );
  }

  async function publish() {
    if (!title.trim() || publishing) return;
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), tagline: tagline.trim(), tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to publish.");
        return;
      }
      onPublished();
    } catch {
      setError("Failed to publish.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="text-[13px] text-white/80 truncate">{label}</span>
        <span className="text-[11px] text-[#FF0080] font-semibold shrink-0">{expanded ? "Cancel" : "Publish"}</span>
      </button>
      {expanded && (
        <div className="mt-2.5 flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            maxLength={120}
            className="w-full h-8 px-3 rounded-full bg-white/5 border border-white/10 text-white text-[12px] outline-none placeholder:text-white/30"
          />
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Tagline (optional)"
            maxLength={200}
            className="w-full h-8 px-3 rounded-full bg-white/5 border border-white/10 text-white text-[12px] outline-none placeholder:text-white/30"
          />
          <div className="flex flex-wrap gap-1.5">
            {BUILD_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`h-6 px-2.5 rounded-full text-[11px] font-semibold transition-colors ${
                  tags.includes(tag) ? "bg-[#FF0080] text-white" : "bg-white/5 text-white/40 border border-white/10 hover:text-white/70"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          <button
            onClick={publish}
            disabled={!title.trim() || publishing}
            className="h-8 rounded-full bg-[#FF0080] text-white text-[12px] font-bold disabled:opacity-40"
          >
            {publishing ? "Publishing…" : "Publish to BuildGuild"}
          </button>
        </div>
      )}
    </div>
  );
}

// "Submit Build" entry point -- matches the pasted reference design's nav
// button, sidebar CTA, and sticky mobile button, all wired to the same
// real modal: pick one of your own builds (fetched via GET /api/projects)
// and publish it, instead of a disconnected freeform submission form.
// Signed-out visitors get sent to sign-in and bounced back here, same
// pattern RemixButton.tsx uses.
export default function SubmitBuildModal({
  signedIn,
  variant,
}: {
  signedIn: boolean;
  variant: "nav" | "card" | "sticky";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function openModal() {
    if (!signedIn) {
      router.push("/sign-in?redirect_url=/buildguild");
      return;
    }
    setOpen(true);
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load your builds.");
      setProjects(data.projects || []);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load your builds.");
    } finally {
      setLoading(false);
    }
  }

  function handlePublished() {
    setOpen(false);
    router.refresh();
  }

  const buttonClass: Record<typeof variant, string> = {
    nav: "hidden sm:grid h-8 md:h-9 px-4 rounded-full bg-white/[0.08] text-white text-[13px] font-semibold place-items-center hover:bg-white/[0.14] transition-colors",
    card: "mt-4 block w-full text-center rounded-full bg-[#FF0080] text-white text-[13px] font-semibold py-2 hover:bg-[#FF0080]/90 transition-colors",
    sticky: "h-11 px-6 rounded-full bg-[#FF0080] text-white text-[13px] font-bold shadow-lg shadow-black/40 grid place-items-center",
  };

  return (
    <>
      <button onClick={openModal} className={buttonClass[variant]}>
        Submit Build
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md max-h-[80vh] overflow-y-auto rounded-t-[24px] sm:rounded-[20px] bg-[#0e0e11] border border-white/10 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-black text-[16px] text-white">Submit a build</h2>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-[18px] leading-none">
                &times;
              </button>
            </div>
            <p className="text-[12px] text-white/40 mb-4">
              Pick one of your builds and publish it to BuildGuild — same flow as the builder and dashboard's "Share
              to BuildGuild" button.
            </p>

            {loading ? (
              <p className="text-[13px] text-white/40">Loading your builds…</p>
            ) : loadError ? (
              <p className="text-[13px] text-red-400">{loadError}</p>
            ) : projects.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[13px] text-white/50">You don&#39;t have any builds yet.</p>
                <a href="/builder" className="mt-3 inline-block px-4 py-2 rounded-full bg-[#FF0080] text-white text-[12px] font-bold">
                  Start building
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {projects.map((p) => (
                  <ProjectRow key={p.id} project={p} onPublished={handlePublished} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
