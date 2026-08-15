"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

type Status = "idle" | "loading" | "error";
type View = "preview" | "code";

const STAGE_LABELS: Record<string, string> = {
  structure: "Reading your prompt and planning the build",
  structure_done: "Structure, content, and interactivity written",
  design: "Applying a visual design pass",
  design_done: "Design polish complete",
  saving: "Saving your build",
};

const STAGE_ORDER = ["structure", "structure_done", "design", "design_done", "saving"];

type Props = {
  initialHtml?: string | null;
  initialPrompt?: string;
  initialProjectId?: string | null;
};

export default function BuilderClient({
  initialHtml = null,
  initialPrompt = "",
  initialProjectId = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [html, setHtml] = useState<string | null>(initialHtml);
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [view, setView] = useState<View>("preview");
  const [log, setLog] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishTagline, setPublishTagline] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState("");
  const lastPromptRef = useRef("");

  // Toast after a successful Stripe redirect (?builder?success=true), then
  // strip the query params so a refresh doesn't re-show it.
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 5000);
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("session_id");
      router.replace(url.pathname + (url.search ? url.search : ""));
      return () => clearTimeout(t);
    }
  }, [searchParams, router]);

  // Prompt typed on the logged-out landing page, carried across sign-up via
  // localStorage (see app/page.tsx). Skipped if we're resuming a saved build.
  useEffect(() => {
    if (initialHtml) return;
    const pending = window.localStorage.getItem("gysm_pending_prompt");
    if (pending) {
      setPrompt(pending);
      window.localStorage.removeItem("gysm_pending_prompt");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live "Xs" counter while a build is running -- the first stage (the
  // OpenAI structure call) is the vast majority of total build time and,
  // without this, the log just sits on one line with no visible motion
  // for 30-60+ seconds, which reads as frozen even when it's working.
  useEffect(() => {
    if (status !== "loading") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  const generate = useCallback(
    async (promptOverride?: string, opts?: { asEdit?: boolean }) => {
      const p = (promptOverride ?? prompt).trim();
      if (!p) return;
      lastPromptRef.current = p;
      setStatus("loading");
      setErrorMsg("");
      setLog([]);
      setSuggestions([]);
      if (!opts?.asEdit) {
        setPrompt(p);
      }

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p,
            previousHtml: opts?.asEdit ? html : undefined,
          }),
        });

        if (res.status === 401) {
          router.push("/sign-in?redirect_url=/builder");
          return;
        }
        if (res.status === 402) {
          router.push("/pricing?reason=no_credits");
          return;
        }
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Something went wrong (${res.status}).`);
        }

        // Read the NDJSON stream: one JSON object per line, updating the
        // live build log as each stage lands instead of one opaque spinner.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const evt = JSON.parse(line);

            if (evt.type === "stage") {
              const label = STAGE_LABELS[evt.stage] ?? evt.stage;
              setLog((prev) => [...prev, label]);
            } else if (evt.type === "error") {
              if (evt.code === "NO_CREDITS") {
                router.push("/pricing?reason=no_credits");
                return;
              }
              throw new Error(evt.error || "Something went wrong.");
            } else if (evt.type === "done") {
              setHtml(evt.html);
              setProjectId(evt.projectId ?? null);
              setSuggestions(Array.isArray(evt.suggestions) ? evt.suggestions : []);
              setView("preview");
              setPublishOpen(false);
              setPublished(false);
              setPublishTitle("");
              setPublishTagline("");
              setPublishError("");
              finished = true;
            }
          }
        }

        if (!finished) throw new Error("No preview came back. Try again.");
        setStatus("idle");
      } catch (e: any) {
        setErrorMsg(e?.message || "Something went wrong.");
        setStatus("error");
      }
    },
    [prompt, html, router]
  );

  // Fire the initial generate automatically only if a pending prompt was
  // carried over from the landing page and nothing's loaded yet.
  useEffect(() => {
    if (!initialHtml && prompt && status === "idle" && !html) {
      // no-op: user still has to hit Generate. Auto-firing here would
      // surprise someone who edited the carried-over prompt first.
    }
  }, [initialHtml, prompt, status, html]);

  function copyCode() {
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function publishToBuildGuild() {
    if (!projectId || !publishTitle.trim() || publishing) return;
    setPublishing(true);
    setPublishError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: publishTitle.trim(), tagline: publishTagline.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPublishError(data?.error || "Failed to publish.");
        return;
      }
      setPublished(true);
    } catch {
      setPublishError("Failed to publish. Check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  }

  const isLoading = status === "loading";

  return (
    <div className="min-h-screen bg-black text-white">
      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
          Payment successful — you're unlocked
        </div>
      )}
      {copied && (
        <div className="fixed top-4 right-4 z-50 bg-white text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
          Copied code to clipboard
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-white/10 mb-6">
          <h1 className="text-2xl font-black">
            GYSM<span className="opacity-30">.IO</span>
          </h1>
          <div className="flex items-center gap-5">
            {html && !isLoading && (
              <button
                onClick={() => {
                  setHtml(null);
                  setProjectId(null);
                  setPrompt("");
                  setSuggestions([]);
                  setLog([]);
                  setView("preview");
                  setPublishOpen(false);
                  setPublished(false);
                  setPublishTitle("");
                  setPublishTagline("");
                  setPublishError("");
                }}
                className="text-[11px] opacity-50 hover:opacity-100"
              >
                New build
              </button>
            )}
            <a href="/buildguild" className="text-[11px] opacity-50 hover:opacity-100">
              BuildGuild
            </a>
            <a href="/dashboard" className="text-[11px] opacity-50 hover:opacity-100">
              My Builds
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        <div className="bg-white/[0.06] border border-white/10 rounded-[24px] p-4 flex gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && generate()}
            placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
            className="flex-1 h-[56px] bg-black rounded-full px-6 outline-none border border-white/10"
            disabled={isLoading}
          />
          <button
            onClick={() => generate()}
            disabled={isLoading || !prompt.trim()}
            className="h-[56px] px-8 rounded-full bg-white text-black font-black disabled:opacity-40 shrink-0"
          >
            {isLoading ? "Building…" : html ? "Rebuild →" : "Generate →"}
          </button>
        </div>

        {status === "error" && (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 flex items-center justify-between gap-4">
            <span>{errorMsg}</span>
            <button
              onClick={() => generate(lastPromptRef.current)}
              className="shrink-0 px-4 py-2 rounded-full bg-white text-black text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live build log -- shown while generating, replaces the old plain spinner */}
        {isLoading && (
          <div className="mt-6 rounded-[20px] border border-white/10 bg-zinc-950 p-5 font-mono text-[13px]">
            <div className="flex items-center justify-between mb-3 text-white/40">
              <span>{elapsed}s elapsed</span>
              {elapsed > 15 && (
                <span className="text-white/30">Full builds can take up to ~90s — still working</span>
              )}
            </div>
            <ul className="space-y-2">
              {STAGE_ORDER.map((key) => {
                const label = STAGE_LABELS[key];
                const idx = log.indexOf(label);
                const isDone = idx !== -1 && idx < log.length - 1;
                const isActive = idx === log.length - 1 && idx !== -1;
                const isPending = idx === -1;
                return (
                  <li
                    key={key}
                    className={
                      isPending
                        ? "text-white/25"
                        : isActive
                        ? "text-white"
                        : "text-white/50"
                    }
                  >
                    <span className="inline-block w-5">
                      {isDone ? "✓" : isActive ? "…" : "·"}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 rounded-[20px] overflow-hidden border border-white/10 bg-white min-h-[600px]">
          {!isLoading && html && (
            <>
              <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 border-b border-black/10">
                <div className="flex gap-1">
                  <button
                    onClick={() => setView("preview")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                      view === "preview" ? "bg-black text-white" : "text-black/50"
                    }`}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setView("code")}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                      view === "code" ? "bg-black text-white" : "text-black/50"
                    }`}
                  >
                    Code
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {view === "code" && (
                    <button
                      onClick={copyCode}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-black text-white"
                    >
                      Copy code
                    </button>
                  )}
                  {projectId && (
                    <a
                      href={`/publish/${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-600 text-white"
                    >
                      Publish / view live →
                    </a>
                  )}
                  {projectId && (
                    <a
                      href={`/publish/${projectId}/app-stores`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold border border-black/15 text-black/70"
                    >
                      App Store / Play Store →
                    </a>
                  )}
                  {projectId && !published && (
                    <button
                      onClick={() => {
                        if (!publishTitle) setPublishTitle(prompt.slice(0, 80));
                        setPublishOpen((v) => !v);
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-fuchsia-600 text-white"
                    >
                      Share to BuildGuild
                    </button>
                  )}
                  {projectId && published && (
                    <a
                      href={`/buildguild/${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-600 text-white"
                    >
                      Live on BuildGuild →
                    </a>
                  )}
                </div>
              </div>

              {publishOpen && !published && (
                <div className="px-4 py-4 bg-fuchsia-50 border-b border-black/10 flex flex-col gap-2">
                  <input
                    value={publishTitle}
                    onChange={(e) => setPublishTitle(e.target.value)}
                    placeholder="Title (shown on BuildGuild)"
                    maxLength={120}
                    className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                  />
                  <input
                    value={publishTagline}
                    onChange={(e) => setPublishTagline(e.target.value)}
                    placeholder="One-line tagline (optional)"
                    maxLength={200}
                    className="w-full h-10 px-4 rounded-full border border-black/10 text-black text-[13px] outline-none"
                  />
                  {publishError && <p className="text-[12px] text-red-600">{publishError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setPublishOpen(false)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold text-black/50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={publishToBuildGuild}
                      disabled={!publishTitle.trim() || publishing}
                      className="px-4 py-1.5 rounded-full text-xs font-bold bg-black text-white disabled:opacity-40"
                    >
                      {publishing ? "Publishing…" : "Publish to BuildGuild"}
                    </button>
                  </div>
                </div>
              )}
              {published && (
                <div className="px-4 py-2.5 bg-emerald-50 border-b border-black/10 text-emerald-700 text-[12px] font-semibold">
                  Live on BuildGuild — anyone can view and comment on it now.
                </div>
              )}

              {view === "preview" ? (
                <iframe
                  srcDoc={html}
                  sandbox="allow-scripts allow-same-origin"
                  className="w-full h-[700px] border-0 bg-white"
                  title="Generated app preview"
                />
              ) : (
                <pre className="w-full h-[700px] overflow-auto bg-zinc-950 text-zinc-200 text-[12px] leading-[1.6] p-5 m-0">
                  <code>{html}</code>
                </pre>
              )}
            </>
          )}

          {!isLoading && !html && (
            <div className="h-[750px] flex items-center justify-center text-black/30 text-sm px-8 text-center">
              Your preview shows up here once you generate something.
            </div>
          )}
        </div>

        {/* Post-build "what's next" suggestions -- click one to iterate on
            this exact build (edit pass) instead of starting from scratch. */}
        {!isLoading && html && suggestions.length > 0 && (
          <div className="mt-6">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-40 mb-3">
              What do you want to add next?
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => generate(s, { asEdit: true })}
                  className="px-4 py-2 rounded-full border border-white/15 bg-white/[0.04] hover:bg-white/10 text-[13px] font-medium transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
}
