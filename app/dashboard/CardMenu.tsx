"use client";

import { useEffect, useRef, useState } from "react";

// Overflow ("···") menu for a dashboard card's less-frequent actions
// (publish, app store links, duplicate, download, delete). The card
// previously stacked every action as its own always-visible button/row,
// which got tall and busy fast; the two most-used actions (Open in
// builder, View live) stay inline on the card, everything else moves
// here. Purely a layout wrapper -- the action components passed in as
// children (PublishButton, DuplicateButton, DeleteButton, etc.) keep
// their own existing state and API calls unchanged.
export default function CardMenu({ children }: { children: React.ReactNode }) {
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        className={`w-8 h-8 grid place-items-center rounded-lg border text-sm transition ${
          open ? "bg-black text-white border-black" : "border-black/15 text-black/50 hover:bg-black/5 hover:text-black"
        }`}
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-xl border border-black/10 bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] p-2 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
