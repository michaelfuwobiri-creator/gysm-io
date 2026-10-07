"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Mobile header + drawer for the signed-in app shell (AppShell.tsx), which
// hides its entire left sidebar -- every nav item, the credits/upgrade
// card, the org switcher, and the sign-out button -- behind `hidden
// md:flex` with no mobile equivalent at all. Below the `md` breakpoint a
// signed-in user currently has no way to get from /dashboard to
// /templates, /connectors, /buildguild, /billing, etc., and no way to sign
// out. This renders the same information as a slide-in panel instead.
//
// AppShell is an async server component that computes `displayName`,
// `initial`, and `credits` itself via getUser()/getCreditBalance() -- never
// Clerk's useUser() hook -- so passing them down here as plain props stays
// on the SSR-safe side of the hydration issue documented in
// NavAuthLink.tsx. `footerSlot` carries AppShell's <OrganizationSwitcher />
// and <UserButton />: Clerk's own prebuilt components, already rendered
// (hidden on mobile via CSS, not conditionally mounted) in the desktop
// sidebar without hydration issues, so reusing the same elements here is
// safe too.
//
// The drawer is rendered via createPortal into document.body (see the
// identical fix and explanation in MobileNavMenu.tsx) -- AppShell's own
// ancestor chain has no backdrop-filter/filter/transform today, but
// portaling removes the risk entirely rather than relying on that staying
// true.
type NavItem = { key: string; label: string; href: string; active?: boolean };
type NavGroup = { title: string; items: NavItem[] };

interface MobileAppHeaderProps {
  groups: NavGroup[];
  displayName: string;
  initial: string;
  credits: number;
  footerSlot?: React.ReactNode;
}

export default function MobileAppHeader({ groups, displayName, initial, credits, footerSlot }: MobileAppHeaderProps) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 h-[56px] shrink-0 flex items-center justify-between px-4 bg-white border-b border-black/10">
        <a href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#FF0080] to-[#FF0080] grid place-items-center text-white font-black text-sm shrink-0">
            G
          </div>
          <span className="font-black tracking-tight">GYSM</span>
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-black/70 hover:bg-black/5"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M2 4.5h14M2 9h14M2 13.5h14" />
          </svg>
        </button>
      </div>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="App navigation"
          className="md:hidden fixed inset-0 z-[95] bg-[#FCFCF9] text-[#0A0A0A] flex flex-col"
        >
          <div className="h-[56px] shrink-0 flex items-center justify-between px-4 border-b border-black/[0.05]">
            <span className="font-black tracking-tighter text-[16px]">GYSM</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-black/70 hover:bg-black/5"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d="M2 2l14 14M16 2L2 16" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex items-center gap-2 px-2 py-2 mb-4 rounded-xl bg-black/[0.03]">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#FF0080] to-[#FF0080] grid place-items-center text-white text-[11px] font-black shrink-0">
                {initial}
              </div>
              <span className="text-[13px] font-semibold text-black/70 truncate">{displayName}</span>
            </div>

            {groups.map((group) => (
              <div key={group.title} className="mb-4">
                <div className="px-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-black/30">
                  {group.title}
                </div>
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <a
                      key={item.key}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`py-3 text-[16px] font-medium border-b border-black/[0.05] ${
                        item.active ? "text-black" : "text-black/80"
                      }`}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 flex flex-col gap-2 mt-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Credits</span>
                <span className="text-[13px] font-black">{credits}</span>
              </div>
              <a
                href="/pricing"
                onClick={() => setOpen(false)}
                className="text-[12px] font-bold text-center py-1.5 rounded-full bg-black text-white hover:opacity-90 transition"
              >
                Upgrade →
              </a>
            </div>

            {footerSlot && (
              <div className="flex items-center justify-between gap-2 px-1 pb-3">{footerSlot}</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
