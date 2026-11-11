"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeBlueprint, LANDING_USE_CASES } from "@/lib/blueprint";
import { trackEvent } from "@/lib/analytics/track";

// Interactive "describe it, see the plan" widget. It runs entirely in the
// browser against lib/blueprint.ts: no AI call, no cost, no data sent
// anywhere. It exists to remove the blank-page problem (most visitors who
// leave never typed anything), show them what a build would contain, and hand
// them to the real builder with a better prompt than they would have written.
//
// Behaviour nudges, deliberately modest and honest:
//   * Idle with an empty box for 12s -> the example chips get highlighted.
//   * Plan shown but no click for 20s -> a one-line "your plan is ready" hint.
// Each nudge shows once per visit and is tracked (consent permitting) so the
// funnel can show whether it helps or just adds noise.

export default function IdeaBlueprint({ initialIdea = "", source = "blueprint" }: { initialIdea?: string; source?: string }) {
  const [idea, setIdea] = useState(initialIdea);
  const [debounced, setDebounced] = useState(initialIdea);
  const [chipNudge, setChipNudge] = useState(false);
  const [planNudge, setPlanNudge] = useState(false);
  const typedTracked = useRef(false);
  const shownTracked = useRef<string>("");
  const nudged = useRef({ chip: false, plan: false });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(idea), 250);
    return () => clearTimeout(t);
  }, [idea]);

  const bp = useMemo(() => (debounced.trim().length >= 12 ? makeBlueprint(debounced, { source, medium: "widget" }) : null), [debounced, source]);

  useEffect(() => {
    if (idea.trim().length >= 3 && !typedTracked.current) {
      typedTracked.current = true;
      trackEvent("blueprint_idea_typed", { source });
    }
  }, [idea, source]);

  useEffect(() => {
    if (bp && shownTracked.current !== bp.useCase.slug) {
      shownTracked.current = bp.useCase.slug;
      trackEvent("blueprint_shown", { source, use_case: bp.useCase.slug, matched: bp.useCase.matched });
    }
  }, [bp, source]);

  // Nudge 1: empty box for 12s
  useEffect(() => {
    if (idea.trim() || nudged.current.chip) return;
    const t = setTimeout(() => {
      nudged.current.chip = true;
      setChipNudge(true);
      trackEvent("nudge_shown", { source, kind: "examples" });
    }, 12000);
    return () => clearTimeout(t);
  }, [idea, source]);

  // Nudge 2: plan visible for 20s without a click
  useEffect(() => {
    if (!bp || nudged.current.plan) return;
    const t = setTimeout(() => {
      nudged.current.plan = true;
      setPlanNudge(true);
      trackEvent("nudge_shown", { source, kind: "plan_ready" });
    }, 20000);
    return () => clearTimeout(t);
  }, [bp, source]);

  return (
    <div className="w-full max-w-[760px] mx-auto text-left">
      <label htmlFor="gysm-idea" className="block text-[12px] font-bold uppercase tracking-wider text-black/50">Describe your idea</label>
      <textarea
        id="gysm-idea"
        value={idea}
        onChange={(e) => { setIdea(e.target.value.slice(0, 600)); setChipNudge(false); }}
        rows={3}
        placeholder="e.g. An online store selling handmade candles, with a cart and a shipping section"
        className="mt-2 w-full rounded-2xl border border-black/10 bg-white p-4 text-[15px] leading-[1.5] outline-none focus:border-[#FF0080] focus:ring-2 focus:ring-[#FF0080]/20"
      />

      <div className="mt-3 flex flex-wrap gap-2" aria-label="Example ideas">
        {LANDING_USE_CASES.map((u) => (
          <button
            key={u.slug}
            type="button"
            onClick={() => { setIdea(u.examplePrompt); setChipNudge(false); trackEvent("blueprint_example_clicked", { source, use_case: u.slug }); }}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${chipNudge ? "border-[#FF0080] bg-[#FF0080]/10 text-[#FF0080] animate-pulse" : "border-black/10 bg-white text-black/70 hover:border-black/30"}`}
          >
            {u.name}
          </button>
        ))}
      </div>
      {chipNudge && <p className="mt-2 text-[12.5px] text-[#FF0080] font-medium">Not sure where to start? Tap an example to see what a plan looks like.</p>}

      {bp ? (
        <div className="mt-6 rounded-3xl border border-black/10 bg-white p-5 md:p-7 shadow-sm" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black px-3 py-1 text-[11px] font-bold text-white">{bp.useCase.name}</span>
            {!bp.useCase.matched && <span className="text-[12px] text-black/50">No close match, showing a general plan</span>}
          </div>
          <p className="mt-3 text-[14.5px] leading-[1.6] text-black/70">{bp.summary}</p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-black/50">Page sections</div>
              <ul className="mt-2 space-y-1.5 text-[14px]">{bp.sections.map((s) => <li key={s} className="flex gap-2"><span className="text-[#FF0080]">✓</span>{s}</li>)}</ul>
            </div>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-black/50">Features</div>
              <ul className="mt-2 space-y-1.5 text-[14px]">{bp.features.map((f) => <li key={f} className="flex gap-2"><span className="text-[#FF0080]">✓</span>{f}</li>)}</ul>
            </div>
          </div>

          <details className="mt-5 text-[13.5px] text-black/70">
            <summary className="cursor-pointer font-semibold">Data model, integrations and limits</summary>
            <div className="mt-3 space-y-3">
              <div><b>Suggested tables</b> (stored only if you connect your own Supabase project): {bp.data.map((d) => `${d.table} (${d.fields.join(", ")})`).join("; ")}</div>
              <div><b>Integrations:</b> {bp.integrations.join("; ")}</div>
              <div><b>Good to know:</b> {bp.limits.join(" ")}</div>
            </div>
          </details>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
            <a
              href={bp.buildLink}
              onClick={() => trackEvent("blueprint_cta_clicked", { source, use_case: bp.useCase.slug })}
              className="inline-flex h-[48px] items-center justify-center rounded-full bg-black px-7 text-[14px] font-bold text-white"
            >
              Build this →
            </a>
            <span className="text-[12px] text-black/50">{bp.note}</span>
          </div>
          {planNudge && <p className="mt-3 text-[12.5px] font-medium text-[#FF0080]">Your plan is ready. Tap "Build this" to see it as a live page.</p>}
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-black/40">Type a sentence or two and the plan appears instantly. Nothing is sent anywhere until you press Build.</p>
      )}
    </div>
  );
}
