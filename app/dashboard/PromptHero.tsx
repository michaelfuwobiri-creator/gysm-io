"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import GradientMesh from "../components/GradientMesh";

// Prompt-first entry point at the top of the dashboard -- previously the
// only way to start a new build from here was the small "+ New Build"
// button in the header, landing on an empty /builder. This puts the
// prompt box itself on the dashboard (same pattern as most AI builder
// home screens: greeting + "what do you want to build" front and
// center), reusing /builder's existing ?prompt= deep link (prefill-only,
// never auto-submits -- see app/builder/page.tsx) rather than adding a
// second generate pathway. Visual language (white pill, black button)
// matches the public homepage's own prompt box exactly (see app/page.tsx).
//
// Reference image / Figma attach: BuilderClient.tsx already supports
// attaching a reference image to any generation (imageDataUrl, see
// lib/ai/orchestrator.ts) -- but only once you're already inside the
// builder editing a build. This lets that same attach happen on the very
// first prompt too. A data: URL is too large for a query string, so it's
// handed off via sessionStorage under a fixed key that BuilderClient
// reads once on mount and clears immediately after.
const PENDING_IMAGE_KEY = "gysm:pendingImage";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export default function PromptHero({ greetingName }: { greetingName: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState("");
  const [figmaOpen, setFigmaOpen] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [figmaLoading, setFigmaLoading] = useState(false);
  const [figmaError, setFigmaError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    if (!file.type.startsWith("image/")) {
      setImageError("That file isn't an image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("That image is too large (max 3MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setImageError("Failed to read that image.");
    reader.readAsDataURL(file);
  }

  async function importFromFigma() {
    if (!figmaUrl.trim() || !figmaToken.trim() || figmaLoading) return;
    setFigmaLoading(true);
    setFigmaError("");
    try {
      const res = await fetch("/api/figma/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUrl: figmaUrl.trim(), token: figmaToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFigmaError(data.error || "Import failed.");
        return;
      }
      setImageDataUrl(data.imageDataUrl);
      setFigmaOpen(false);
      setFigmaUrl("");
      setFigmaToken("");
    } catch {
      setFigmaError("Import failed. Check your connection and try again.");
    } finally {
      setFigmaLoading(false);
    }
  }

  function go() {
    const trimmed = value.trim();
    if (imageDataUrl) {
      try {
        sessionStorage.setItem(PENDING_IMAGE_KEY, imageDataUrl);
      } catch {
        // Storage can fail (private browsing, quota) -- generation still
        // works without the image rather than blocking the build.
      }
    }
    router.push(trimmed ? `/builder?prompt=${encodeURIComponent(trimmed)}` : "/builder");
  }

  return (
    <div className="relative mb-10 rounded-[28px] overflow-hidden border border-black/5 bg-[#FCFCF9] p-8 sm:p-10 shadow-sm">
      <GradientMesh />
      <div className="relative max-w-2xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
          Ready to build{greetingName ? `, ${greetingName}` : ""}?
        </h1>
        <p className="text-black/50 text-sm mt-2 mb-6">
          Describe the app you want. GYSM.IO builds it -- auth, database, and payments included.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 rounded-[20px] sm:rounded-full border border-black/10 bg-white p-2 shadow-sm">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="What do you want to build? e.g. a food delivery app with 6 dishes"
            className="min-w-0 flex-1 h-[48px] sm:h-[56px] rounded-full px-5 sm:px-6 outline-none text-[14px]"
          />
          <button
            onClick={go}
            className="h-[48px] sm:h-[56px] px-6 sm:px-8 rounded-full bg-black text-white font-bold text-[14px] hover:opacity-90 transition shrink-0"
          >
            Build →
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 mt-3 text-[12px]">
          {imageDataUrl ? (
            <div className="flex items-center gap-2 bg-white border border-black/10 rounded-full pl-1 pr-3 py-1">
              <img src={imageDataUrl} alt="Attached reference" className="w-6 h-6 rounded-full object-cover" />
              <span className="text-black/50">Reference attached</span>
              <button onClick={() => setImageDataUrl(null)} className="text-black/30 hover:text-black/60 font-bold">
                ×
              </button>
            </div>
          ) : (
            <>
              <button onClick={() => fileInputRef.current?.click()} className="text-black/40 hover:text-black/70 font-medium underline underline-offset-4">
                Attach a reference image
              </button>
              <span className="text-black/20">·</span>
              <button onClick={() => setFigmaOpen(true)} className="text-black/40 hover:text-black/70 font-medium underline underline-offset-4">
                Import from Figma
              </button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
        </div>
        {imageError && <p className="text-red-500 text-[12px] mt-1">{imageError}</p>}
      </div>

      {figmaOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setFigmaOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl border border-black/10 shadow-xl p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black tracking-tight">Import from Figma</h3>
              <button onClick={() => setFigmaOpen(false)} className="text-black/40 hover:text-black text-xl leading-none">
                ×
              </button>
            </div>
            <p className="text-black/45 text-[13px] mb-4">
              Right-click the frame you want in Figma and choose "Copy link to selection" -- that link (not a whole-file link) renders as a reference image for this build.
            </p>
            <div className="flex flex-col gap-2.5">
              <label className="text-[12px] font-bold text-black/50">
                Figma link (to a specific frame)
                <input
                  value={figmaUrl}
                  onChange={(e) => setFigmaUrl(e.target.value)}
                  placeholder="https://www.figma.com/design/…?node-id=…"
                  className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                />
              </label>
              <label className="text-[12px] font-bold text-black/50">
                Personal access token
                <input
                  type="password"
                  value={figmaToken}
                  onChange={(e) => setFigmaToken(e.target.value)}
                  placeholder="figd_…"
                  className="mt-1 w-full h-10 rounded-lg border border-black/10 px-3 text-[13px] outline-none focus:border-black/30"
                />
              </label>
              {figmaError && <div className="text-red-600 text-[13px]">{figmaError}</div>}
              <button
                onClick={importFromFigma}
                disabled={figmaLoading || !figmaUrl.trim() || !figmaToken.trim()}
                className="mt-1 py-2.5 rounded-full bg-black text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition"
              >
                {figmaLoading ? "Importing…" : "Import"}
              </button>
              <p className="text-black/30 text-[11px]">
                Create a token at figma.com → Settings → Personal access tokens. Only used for this import, never stored.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
