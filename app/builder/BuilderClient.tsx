"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Status = "idle" | "loading" | "error";

export default function BuilderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [prompt, setPrompt] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showToast, setShowToast] = useState(false);
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

  // Prompt typed on the logged-out landing page, carried across /auth via
  // localStorage (see app/page.tsx and app/auth/page.tsx).
  useEffect(() => {
    const pending = window.localStorage.getItem("gysm_pending_prompt");
    if (pending) {
      setPrompt(pending);
      window.localStorage.removeItem("gysm_pending_prompt");
    }
  }, []);

  const generate = useCallback(
    async (promptOverride?: string) => {
      const p = (promptOverride ?? prompt).trim();
      if (!p) return;
      lastPromptRef.current = p;
      setStatus("loading");
      setErrorMsg("");
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p }),
        });

        if (res.status === 401) {
          router.push("/auth?redirect=/builder");
          return;
        }
        if (res.status === 402) {
          router.push("/pricing?reason=no_credits");
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Something went wrong (${res.status}).`);
        }

        const data = await res.json();
        if (!data.html) throw new Error("No preview came back. Try again.");
        setHtml(data.html);
        setStatus("idle");
      } catch (e: any) {
        setErrorMsg(e?.message || "Something went wrong.");
        setStatus("error");
      }
    },
    [prompt, router]
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {showToast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg">
          Payment successful — you're unlocked 🎉
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-white/10 mb-6">
          <h1 className="text-2xl font-black">
            GYSM<span className="opacity-30">.IO</span>
          </h1>
          <a href="/dashboard" className="text-[11px] opacity-50 hover:opacity-100">
            My Builds
          </a>
        </div>

        <div className="bg-white/[0.06] border border-white/10 rounded-[24px] p-4 flex gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && generate()}
            placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
            className="flex-1 h-[56px] bg-black rounded-full px-6 outline-none border border-white/10"
          />
          <button
            onClick={() => generate()}
            disabled={status === "loading" || !prompt.trim()}
            className="h-[56px] px-8 rounded-full bg-white text-black font-black disabled:opacity-40"
          >
            {status === "loading" ? "Building…" : "Generate →"}
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

        <div className="mt-6 rounded-[20px] overflow-hidden border border-white/10 bg-white min-h-[600px]">
          {status === "loading" && (
            <div className="h-[750px] flex items-center justify-center bg-zinc-900">
              <div className="text-white/50 text-sm animate-pulse">Building your preview…</div>
            </div>
          )}

          {status !== "loading" && html && (
            <iframe
              srcDoc={html}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-[750px] border-0 bg-white"
              title="Generated app preview"
            />
          )}

          {status === "idle" && !html && (
            <div className="h-[750px] flex items-center justify-center text-black/30 text-sm px-8 text-center">
              Your preview shows up here once you generate something.
            </div>
          )}
        </div>

        <div className="h-20" />
      </div>
    </div>
  );
}
