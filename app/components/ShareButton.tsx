"use client";

import { useEffect, useRef, useState } from "react";

// Small self-contained share widget dropped onto a build's public pages
// (publish/[id], the BuildGuild detail page, and the builder toolbar once
// a build has a projectId). Pure share-intent links -- no server calls,
// no analytics wiring -- so it's safe to reuse anywhere a build has a
// public URL and a title.
type Props = {
  url: string;
  title: string;
  variant?: "dark" | "light";
  dropUp?: boolean;
  className?: string;
};

export default function ShareButton({ url, title, variant = "dark", dropUp = false, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} — built with GYSM.IO`);

  const links = [
    { label: "X / Twitter", href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ];

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const isDark = variant === "dark";

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          (isDark
            ? "border border-white/15 text-white/80 hover:bg-white/10"
            : "border border-black/15 text-black/70 hover:bg-black/5") +
          " px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition"
        }
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" />
          <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" />
        </svg>
        Share
      </button>

      {open && (
        <div
          className={
            (dropUp ? "absolute bottom-full mb-2 " : "absolute top-full mt-2 ") +
            "right-0 rounded-2xl shadow-xl p-1.5 w-48 z-50 " +
            (isDark ? "bg-zinc-900 border border-white/10 text-white" : "bg-white border border-black/10 text-black")
          }
        >
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={"block px-3 py-2 rounded-xl text-[13px] font-medium " + (isDark ? "hover:bg-white/10" : "hover:bg-black/5")}
            >
              Share on {l.label}
            </a>
          ))}
          <button
            onClick={copyLink}
            className={"block w-full text-left px-3 py-2 rounded-xl text-[13px] font-medium " + (isDark ? "hover:bg-white/10" : "hover:bg-black/5")}
          >
            {copied ? "Link copied ✓" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
