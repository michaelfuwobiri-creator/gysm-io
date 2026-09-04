"use client";

import { useState } from "react";

const CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
  }
}

let crispLoadStarted = false;
function loadCrisp() {
  if (crispLoadStarted || typeof window === "undefined" || !CRISP_WEBSITE_ID) return;
  crispLoadStarted = true;
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
  const script = document.createElement("script");
  script.src = "https://client.crisp.chat/l.js";
  script.async = true;
  document.head.appendChild(script);
}

// Floating support-chat button (Crisp). Optional, same
// degrade-gracefully pattern as every other third-party integration in
// this app (see .env.local.example) -- unset NEXT_PUBLIC_CRISP_WEBSITE_ID
// and this renders nothing at all.
//
// Click-to-load rather than loading Crisp's script unconditionally on
// every page: Crisp sets its own cookies once it initializes, so loading
// it eagerly for every visitor would mean it needs to sit behind the
// cookie-consent gate the same way PostHog/GA4 do (see AnalyticsGate.tsx)
// -- extra plumbing for a widget most visitors never open. Loading it
// only on an explicit click is a "user-triggered feature" (the same
// exemption CookieConsent.tsx already relies on for the
// gysm_pending_prompt localStorage key): no third-party storage is set
// until the person deliberately asks to start a chat, so there's nothing
// to gate behind consent.
//
// Positioned bottom-6 right-5 with z-40, well under CookieConsent's
// z-[100] full-width bottom banner -- if that banner is still showing
// (visitor hasn't made a cookie choice yet), this sits visually above it.
export default function ChatWidget() {
  const [loading, setLoading] = useState(false);

  if (!CRISP_WEBSITE_ID) return null;

  function handleClick() {
    if (window.$crisp) {
      window.$crisp.push(["do", "chat:open"]);
      return;
    }
    setLoading(true);
    loadCrisp();
    // Crisp opens its own launcher once it boots; give it a moment then
    // ask it to open the chat panel directly so the click feels immediate
    // rather than just spawning a bubble the person has to click again.
    const tryOpen = (attempt: number) => {
      if (window.$crisp) {
        window.$crisp.push(["do", "chat:open"]);
        setLoading(false);
        return;
      }
      if (attempt < 20) setTimeout(() => tryOpen(attempt + 1), 250);
      else setLoading(false);
    };
    setTimeout(() => tryOpen(0), 250);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Chat with support"
      className="fixed bottom-6 right-5 z-40 h-12 w-12 rounded-full bg-[#0A0A0A] text-white shadow-lg grid place-items-center hover:scale-105 transition disabled:opacity-60"
      disabled={loading}
    >
      {loading ? (
        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
      )}
    </button>
  );
}
