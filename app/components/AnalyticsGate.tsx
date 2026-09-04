"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import { CONSENT_EVENT, readConsent, type ConsentState } from "./CookieConsent";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

let posthogInitStarted = false;
async function initPostHog() {
  if (posthogInitStarted || !POSTHOG_KEY || typeof window === "undefined") return;
  posthogInitStarted = true;
  try {
    const posthog = (await import("posthog-js")).default;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
    });
    window.posthog = posthog;
  } catch (err) {
    console.error("[analytics] PostHog init failed:", err);
    posthogInitStarted = false;
  }
}

// Keeps @vercel/analytics from firing until the visitor has made a cookie
// choice (see CookieConsent.tsx) and off entirely if they reject
// non-essential storage. Previously <Analytics /> was mounted directly and
// unconditionally in app/layout.tsx. Now also gates PostHog init and the
// GA4 gtag.js scripts behind the same consent state -- both are optional
// (see .env.local.example) and simply never load if their env var is unset.
export default function AnalyticsGate() {
  const [analyticsOn, setAnalyticsOn] = useState(false);

  useEffect(() => {
    const apply = (state: ConsentState | null) => setAnalyticsOn(!!state?.analytics);
    apply(readConsent());

    const onChange = (e: Event) => apply((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (analyticsOn) initPostHog();
  }, [analyticsOn]);

  if (!analyticsOn) return null;
  return (
    <>
      <Analytics />
      {GA_MEASUREMENT_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });`}
          </Script>
        </>
      )}
    </>
  );
}
