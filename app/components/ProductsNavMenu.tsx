"use client";

import { useEffect, useRef, useState } from "react";

// "Products" nav dropdown -- GYSM now ships two distinct builder
// surfaces (the flagship prompt-driven AI builder, and the new
// drag-and-drop Lego builder core at /builder-blocks, kept as its own
// separate route rather than replacing the original -- see
// GYSM_IO_HANDOFF.md item #6). Surfacing both here so the new one is
// actually discoverable from the homepage, not just the dashboard
// sidebar. Same click-open/click-outside-close pattern as
// app/dashboard/CardMenu.tsx.
const PRODUCTS = [
  {
    href: "/builder",
    label: "AI Builder",
    description: "Describe your app in plain English -- GYSM builds it.",
  },
  {
    href: "/builder-blocks",
    label: "Lego Builder",
    badge: "Beta",
    description: "Drag and drop real blocks -- auth, payments, forms -- to build an app.",
  },
];

export default function ProductsNavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-[13px] font-medium mr-2 flex items-center gap-1 ${open ? "opacity-100" : "opacity-60"}`}
      >
        Products
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`transition ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-3 w-[300px] rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] p-2">
          {PRODUCTS.map((p) => (
            <a
              key={p.href}
              href={p.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl p-3 hover:bg-black/[0.04] transition"
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold">{p.label}</span>
                {p.badge && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#FF0080] bg-[#FF0080]/10 rounded-full px-2 py-0.5">
                    {p.badge}
                  </span>
                )}
              </div>
              <div className="text-[12px] opacity-50 mt-0.5">{p.description}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
