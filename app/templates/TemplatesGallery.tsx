"use client";

import { useEffect, useMemo, useState } from "react";
import type { TemplateCard } from "./page";
import { toThumbnailHtml } from "@/lib/thumbnailHtml";

// Card grid + click-to-preview modal for /templates. Mirrors the pattern
// from competitor "no-code AI builder" template galleries -- a real
// screenshot-style thumbnail, a short curated name/description instead of
// the raw prompt, a lightweight modal (name, description, live preview,
// one CTA), and a category filter row -- while keeping GYSM's own light
// identity (see app/page.tsx) rather than copying anyone else's visual
// design.
//
// Categories are guessed client-side from each template's name/blurb/
// prompt rather than a new `category` database column -- GYSM only has
// a handful of curated templates today, so a keyword heuristic here is
// honest and gives a real, working filter without a schema change.
const CATEGORY_RULES: { label: string; test: RegExp }[] = [
  { label: "Healthcare", test: /clinic|doctor|health|patient|appointment|care/i },
  { label: "Dating & Social", test: /dating|zodiac|match|social|community/i },
  { label: "SaaS & Billing", test: /saas|billing|subscription|invoice|dashboard|plan/i },
  { label: "Agency & Portfolio", test: /agency|portfolio|studio|client|freelance/i },
  { label: "Ecommerce", test: /store|shop|product|cart|ecommerce|checkout/i },
];

function guessCategory(t: TemplateCard): string {
  const haystack = `${t.name || ""} ${t.blurb || ""} ${t.prompt}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(haystack)) return rule.label;
  }
  return "Other";
}

export default function TemplatesGallery({ templates }: { templates: TemplateCard[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("All");
  const open = templates.find((t) => t.id === openId) || null;

  const categorized = useMemo(
    () => templates.map((t) => ({ ...t, category: guessCategory(t) })),
    [templates]
  );
  const categories = useMemo(() => {
    const seen = new Set(categorized.map((t) => t.category));
    return ["All", ...CATEGORY_RULES.map((r) => r.label).filter((l) => seen.has(l)), ...(seen.has("Other") ? ["Other"] : [])];
  }, [categorized]);
  const filtered = category === "All" ? categorized : categorized.filter((t) => t.category === category);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.06),transparent_60%)]" />
      <div className="max-w-6xl mx-auto relative">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Templates</h1>
            <p className="text-black/40 text-sm mt-1">
              Start from a real, working app instead of a blank prompt.
            </p>
          </div>
          <a
            href="/builder"
            className="px-4 py-2 bg-black text-white rounded-full text-sm font-bold hover:opacity-90 transition"
          >
            Start from scratch
          </a>
        </div>

        {templates.length > 0 && categories.length > 2 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition ${
                  category === c
                    ? "bg-black text-white border-black"
                    : "bg-white text-black/60 border-black/10 hover:text-black hover:border-black/20"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {templates.length === 0 ? (
          <div className="text-black/50 p-10 border border-dashed border-black/10 rounded-2xl text-center bg-white">
            No templates published yet.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-black/50 p-10 border border-dashed border-black/10 rounded-2xl text-center bg-white">
            No templates in this category yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((t) => {
              const title = t.name || t.prompt.slice(0, 60);
              const description = t.blurb || t.prompt;
              return (
                <div
                  key={t.id}
                  onClick={() => setOpenId(t.id)}
                  className="group cursor-pointer rounded-2xl border border-black/5 bg-white overflow-hidden flex flex-col shadow-sm transition hover:border-fuchsia-500/30 hover:shadow-md"
                >
                  <div className="relative h-[170px] bg-white overflow-hidden pointer-events-none border-b border-black/5">
                    <div
                      style={{
                        width: "166.7%",
                        height: "166.7%",
                        transform: "scale(0.6)",
                        transformOrigin: "top left",
                      }}
                    >
                      <iframe
                        srcDoc={toThumbnailHtml(t.html)}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                        title={title}
                        tabIndex={-1}
                        scrolling="no"
                      />
                    </div>
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-white/90 backdrop-blur border border-black/5 text-black/50">
                      {t.category}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-1.5 flex-1">
                    <div className="font-bold text-[15px] text-black line-clamp-1">{title}</div>
                    <div className="text-black/45 text-[13px] line-clamp-2 flex-1">{description}</div>
                    <a
                      href={`/builder?template=${t.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 text-center py-2 bg-black text-white rounded-lg text-[13px] font-bold hover:opacity-90 transition"
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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setOpenId(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[85vh] bg-white border border-black/10 rounded-2xl overflow-hidden flex flex-col shadow-[0_0_80px_-20px_rgba(124,58,237,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-black/10">
              <div className="min-w-0">
                <div className="text-lg font-black text-black truncate">
                  {open.name || open.prompt.slice(0, 60)}
                </div>
                {(open.blurb || open.prompt) && (
                  <p className="text-black/45 text-[13px] mt-1 line-clamp-2">{open.blurb || open.prompt}</p>
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
                  className="w-8 h-8 grid place-items-center rounded-full text-black/50 hover:text-black hover:bg-black/[0.05] transition"
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
