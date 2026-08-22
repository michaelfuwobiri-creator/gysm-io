"use client";

import { useEffect, useState } from "react";
import type { TemplateCard } from "./page";

// Card grid + click-to-preview modal for /templates. Mirrors the pattern
// from competitor "no-code AI builder" template galleries -- a real
// screenshot-style thumbnail, a short curated name/description instead of
// the raw prompt, and a lightweight modal (name, description, live
// preview, one CTA) rather than a full page navigation just to see what a
// template looks like -- while keeping GYSM's own dark violet/fuchsia
// identity (see app/page.tsx) rather than copying anyone else's visual
// design.
export default function TemplatesGallery({ templates }: { templates: TemplateCard[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = templates.find((t) => t.id === openId) || null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-black text-white p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.16),transparent_60%)]" />
      <div className="max-w-6xl mx-auto relative">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Templates</h1>
            <p className="text-white/40 text-sm mt-1">
              Start from a real, working app instead of a blank prompt.
            </p>
          </div>
          <a
            href="/builder"
            className="px-4 py-2 bg-white text-black rounded-full text-sm font-bold hover:bg-white/90 transition"
          >
            Start from scratch
          </a>
        </div>

        {templates.length === 0 ? (
          <div className="text-white/50 p-10 border border-dashed border-white/10 rounded-2xl text-center">
            No templates published yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {templates.map((t) => {
              const title = t.name || t.prompt.slice(0, 60);
              const description = t.blurb || t.prompt;
              return (
                <div
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="group cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col transition hover:border-fuchsia-500/40 hover:bg-white/[0.05] hover:shadow-[0_0_40px_-15px_rgba(217,70,239,0.35)]"
                >
                  <div className="relative h-[170px] bg-white overflow-hidden pointer-events-none">
                    <div
                      style={{
                        width: "166.7%",
                        height: "166.7%",
                        transform: "scale(0.6)",
                        transformOrigin: "top left",
                      }}
                    >
                      <iframe
                        srcDoc={t.html}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                        title={title}
                        tabIndex={-1}
                      />
                    </div>
                  </div>
                  <div className="p-4 flex flex-col gap-1.5 flex-1">
                    <div className="font-bold text-[15px] text-white line-clamp-1">{title}</div>
                    <div className="text-white/45 text-[13px] line-clamp-2 flex-1">{description}</div>
                    <a
                      href={`/builder?template=${t.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 text-center py-2 bg-white text-black rounded-lg text-[13px] font-bold hover:bg-white/90 transition"
                    >
                      Use this template
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setOpenId(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_80px_-20px_rgba(124,58,237,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-white/10">
              <div className="min-w-0">
                <div className="text-lg font-black text-white truncate">
                  {open.name || open.prompt.slice(0, 60)}
                </div>
                {(open.blurb || open.prompt) && (
                  <p className="text-white/45 text-[13px] mt-1 line-clamp-2">{open.blurb || open.prompt}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/builder?template=${open.id}`}
                  className="px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-90 transition"
                >
                  Use this template
                </a>
                <button
                  onClick={() => setOpenId(null)}
                  aria-label="Close"
                  className="w-8 h-8 grid place-items-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              <iframe
                srcDoc={open.html}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={open.name || "Template preview"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
