"use client";

import { CONSENT_KEY } from "./CookieConsent";

// Lets a visitor reopen the cookie banner after they've already made a
// choice -- required so "you can change this anytime" (CookieConsent.tsx's
// own copy) is actually true. Clearing the stored choice and reloading is
// simpler and more robust than threading banner-visibility state through a
// server-rendered layout.
export default function CookiePreferencesLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.localStorage.removeItem(CONSENT_KEY);
        window.location.reload();
      }}
      className={className ?? "text-black/80 hover:text-black text-left"}
    >
      Cookie preferences
    </button>
  );
}
