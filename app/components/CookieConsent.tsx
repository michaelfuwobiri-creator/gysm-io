"use client";

import { useEffect, useState } from "react";

// Cookie/analytics consent banner. GDPR/ePrivacy require an opt-in, granular
// choice before anything non-essential runs (see @vercel/analytics,
// posthog-js, and the GA4 gtag.js scripts, all gated by AnalyticsGate.tsx
// reading the same localStorage key -- PostHog and GA4 were added after
// this banner was first written; see lib/analytics/track.ts). "Necessary"
// storage below is the functional localStorage GYSM already uses --
// gysm_pending_prompt (app/page.tsx, app/components/UseCaseLanding.tsx) and
// the App Store submission checklist (AppStoreGuide.tsx) -- both strictly
// necessary for a feature the user directly triggered, so they're exempt
// from consent under ePrivacy Art. 5(3) and shown here only for
// transparency, not as a toggle.
export const CONSENT_KEY = "gysm_cookie_consent";
export const CONSENT_EVENT = "gysm:consent-changed";

export type ConsentState = { analytics: boolean; ts: number };

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as ConsentState) : null;
  } catch {
    return null;
  }
}

function writeConsent(analytics: boolean) {
  const state: ConsentState = { analytics, ts: Date.now() };
  window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analyticsChoice, setAnalyticsChoice] = useState(true);

  useEffect(() => {
    if (readConsent() !== null) {
      setVisible(false);
      return;
    }
    // Global Privacy Control: a browser/extension-level opt-out signal
    // California's CPRA (and several other US state privacy laws)
    // requires businesses to honor as equivalent to a manual "reject
    // non-essential" choice. If the visitor's browser sends it, respect
    // it immediately and silently rather than making them click through
    // a banner to get the choice their browser already told us.
    const gpc = (navigator as any).globalPrivacyControl === true;
    if (gpc) {
      writeConsent(false);
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const accept = (analytics: boolean) => {
    writeConsent(analytics);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-5"
    >
      <div className="mx-auto max-w-[640px] rounded-2xl border border-black/10 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.15)] p-5">
        <p className="text-[13px] leading-relaxed text-black/70">
          We use a small amount of storage to run GYSM.IO -- some of it (like
          remembering a prompt you typed before signing in) is strictly
          necessary and always on. The rest is optional product analytics
          (Vercel Analytics, PostHog, and Google Analytics, where configured)
          that helps us see what's working -- Vercel Analytics is cookieless,
          while PostHog and Google Analytics do set analytics cookies, which
          is why this choice is opt-in. You can change this anytime from the
          link in the footer.
        </p>

        {expanded && (
          <div className="mt-3 space-y-2 border-t border-black/10 pt-3">
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span className="opacity-60">Necessary (always on)</span>
              <input type="checkbox" checked disabled className="accent-black" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span>Analytics (Vercel Analytics, PostHog, Google Analytics)</span>
              <input
                type="checkbox"
                checked={analyticsChoice}
                onChange={(e) => setAnalyticsChoice(e.target.checked)}
                className="accent-black"
              />
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!expanded ? (
            <>
              <button
                onClick={() => accept(true)}
                className="px-4 py-2 rounded-full bg-black text-white text-[13px] font-semibold hover:opacity-90"
              >
                Accept all
              </button>
              <button
                onClick={() => accept(false)}
                className="px-4 py-2 rounded-full border border-black/15 text-[13px] font-semibold hover:bg-black/5"
              >
                Reject non-essential
              </button>
              <button
                onClick={() => setExpanded(true)}
                className="px-3 py-2 text-[13px] font-semibold opacity-60 hover:opacity-100"
              >
                Customize
              </button>
            </>
          ) : (
            <button
              onClick={() => accept(analyticsChoice)}
              className="px-4 py-2 rounded-full bg-black text-white text-[13px] font-semibold hover:opacity-90"
            >
              Save preferences
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
