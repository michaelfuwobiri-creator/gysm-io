"use client";

import { useEffect, useState } from "react";

// Mobile navigation: a hamburger button (visible only below the `md`
// breakpoint) that opens a full-screen link list. This exists because every
// marketing nav in this app hides its secondary links behind `hidden
// md:block` with no mobile equivalent at all -- see app/[locale]/page.tsx,
// app/buildguild/page.tsx, app/flow-tv/page.tsx, and
// app/components/UseCaseLanding.tsx, all of which render this component to
// expose those same links on mobile instead of hiding them outright.
//
// `authSlot` is for auth-aware content (e.g. Log in / Dashboard) that must
// come from a component using Clerk's useUser() -- and per
// app/components/NavAuthLink.tsx, any such component must be loaded via
// next/dynamic(..., { ssr: false }) by the page, never rendered directly
// here, or React hydration breaks. This component itself never calls
// useUser() and is safe to render during SSR.
export type MobileNavLink = {
  href: string;
  label: string;
  badge?: string;
  description?: string;
};

interface MobileNavMenuProps {
  links: MobileNavLink[];
  theme?: "light" | "dark";
  authSlot?: React.ReactNode;
}

export default function MobileNavMenu({ links, theme = "light", authSlot }: MobileNavMenuProps) {
  const [open, setOpen] = useState(false);
  const isDark = theme === "dark";

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const iconColor = isDark ? "text-white/80 hover:bg-white/10" : "text-black/70 hover:bg-black/5";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className={`md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${iconColor}`}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className={`md:hidden fixed inset-0 z-[95] flex flex-col ${isDark ? "bg-[#08080a] text-white" : "bg-[#FCFCF9] text-black"}`}
        >
          <div
            className={`h-[56px] shrink-0 flex items-center justify-between px-5 border-b ${isDark ? "border-white/[0.06]" : "border-black/[0.05]"}`}
          >
            <span className="font-black tracking-tighter text-[16px]">GYSM</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${iconColor}`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M2 2l14 14M16 2L2 16" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-5 py-2">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex flex-col gap-0.5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-black/[0.05]"}`}
              >
                <span className="flex items-center gap-2 text-[17px] font-medium">
                  {link.label}
                  {link.badge && (
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        isDark ? "bg-white/10 text-white/70" : "bg-black/5 text-black/60"
                      }`}
                    >
                      {link.badge}
                    </span>
                  )}
                </span>
                {link.description && (
                  <span className={`text-[13px] leading-snug ${isDark ? "text-white/50" : "text-black/50"}`}>
                    {link.description}
                  </span>
                )}
              </a>
            ))}
            {authSlot && (
              <div className={`py-4 border-b ${isDark ? "border-white/[0.06]" : "border-black/[0.05]"}`} onClick={() => setOpen(false)}>
                {authSlot}
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
