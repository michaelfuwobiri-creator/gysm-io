"use client";

import { useEffect } from "react";

// Registers the PWA service worker on the client. Split into its own
// component (rather than inline in the root layout) because service worker
// APIs are browser-only and the root layout is a server component.
export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-critical -- the site works fully without the service worker,
        // it only enables install-ability polish. Fail silently.
      });
    }
  }, []);

  return null;
}
