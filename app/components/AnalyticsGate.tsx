"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { CONSENT_EVENT, readConsent, type ConsentState } from "./CookieConsent";

// Keeps @vercel/analytics from firing until the visitor has made a cookie
// choice (see CookieConsent.tsx) and off entirely if they reject
// non-essential storage. Previously <Analytics /> was mounted directly and
// unconditionally in app/layout.tsx.
export default function AnalyticsGate() {
  const [analyticsOn, setAnalyticsOn] = useState(false);

  useEffect(() => {
    const apply = (state: ConsentState | null) => setAnalyticsOn(!!state?.analytics);
    apply(readConsent());

    const onChange = (e: Event) => apply((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  if (!analyticsOn) return null;
  return <Analytics />;
}
