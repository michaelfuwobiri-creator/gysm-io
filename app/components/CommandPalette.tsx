"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Action = { label: string; hint?: string; href?: string; run?: () => void; keywords?: string };

// Site-wide Cmd/Ctrl+K palette -- mounted once in AppShell.tsx, so it's
// available on every AppShell page (dashboard, templates, connectors,
// billing, team, api-keys, builder-blocks, buildguild, roadmap, feedback).
// Deliberately NOT mounted in the root layout: app/builder/page.tsx does
// not render through AppShell (confirmed -- no AppShell import there) and
// already has its own local Ctrl/Cmd+K handler scoped to searching
// chats/artifacts/media inside the builder (LinearBuilderClient.tsx's
// CommandPalette, line ~1774) -- a second global listener on that same
// page would fight it for the keystroke. This component only ever
// navigates via next/navigation router.push, so it has nothing to do with
// -- and can't collide with -- that in-builder search.
const ACTIONS: Action[] = [
  { label: "Dashboard", href: "/dashboard", keywords: "home projects builds" },
  { label: "New build", href: "/builder", keywords: "create ai prompt generate" },
  { label: "Lego Builder (beta)", href: "/builder-blocks", keywords: "drag drop blocks" },
  { label: "Templates", href: "/templates", keywords: "gallery starter" },
  { label: "Connectors", href: "/connectors", keywords: "supabase database backend" },
  { label: "Analytics", href: "/dashboard/analytics", keywords: "mrr users chart" },
  { label: "BuildGuild", href: "/buildguild", keywords: "community published apps" },
  { label: "Roadmap", href: "/roadmap", keywords: "planned shipped vote" },
  { label: "Feedback", href: "/feedback", keywords: "idea suggest request" },
  { label: "Billing", href: "/billing", keywords: "plan subscription credits invoice" },
  { label: "Pricing", href: "/pricing", keywords: "upgrade plans" },
  { label: "Team", href: "/team", keywords: "members invite organization" },
  { label: "API Keys", href: "/settings/api-keys", keywords: "developer token" },
  { label: "Support", href: "/support", keywords: "help contact email" },
];

// Small client-side button that just fires the same custom event
// CommandPalette listens for below -- pulled out separately so AppShell
// (an async Server Component) can render a clickable "Search... ⌘K"
// affordance without itself needing an onClick handler, which Server
// Components can't attach directly.
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("gysm:open-command-palette"))}
      className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-lg border border-black/10 text-[12px] font-semibold text-black/40 hover:text-black/70 hover:border-black/20 transition"
    >
      <span>Search…</span>
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-black/10">⌘K</span>
    </button>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    }
    // Also openable via a plain click (see the "Search... ⌘K" button in
    // AppShell's sidebar) for anyone who doesn't know the shortcut exists.
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("gysm:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("gysm:open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after the modal actually mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIONS;
    return ACTIONS.filter(
      (a) => a.label.toLowerCase().includes(q) || a.keywords?.toLowerCase().includes(q)
    );
  }, [query]);

  function select(action: Action) {
    setOpen(false);
    if (action.href) router.push(action.href);
    else action.run?.();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-black/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[activeIndex]) {
              select(results[activeIndex]);
            }
          }}
          placeholder="Jump to…"
          className="w-full px-5 py-4 text-[15px] outline-none border-b border-black/10"
        />
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-black/40">No matches.</p>
          )}
          {results.map((action, i) => (
            <button
              key={action.label}
              onClick={() => select(action)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-[14px] font-semibold transition ${
                i === activeIndex ? "bg-black text-white" : "text-black/80 hover:bg-black/[0.04]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-black/10 text-[11px] text-black/30 flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
