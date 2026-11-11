"use client";

import { readConsent } from "@/app/components/CookieConsent";

// First-touch attribution: remember where a visitor first came from (UTM
// tags, a ?ref= code, or the referring site) so that later events (a build
// started, a plan generated, a checkout) can be tied back to the channel
// that actually brought them. Answers "which channels reach the people who
// really build things" instead of "which channel sends clicks".
//
// Privacy: this is non-essential storage, so nothing is read from the URL or
// written to localStorage unless the visitor has accepted analytics in the
// cookie banner (CookieConsent.tsx). It is called from AnalyticsGate only
// after consent. Values are cleaned and length-capped; nothing personal is
// stored, and it is never sent anywhere except through trackEvent (which is
// also consent-gated).

const KEY = "gysm_attr";

export type Attribution = { source?: string; medium?: string; campaign?: string; ref?: string; landing?: string; ts: number };

function clean(v: string | null | undefined, max = 60): string | undefined {
  if (!v) return undefined;
  const s = v.toLowerCase().replace(/[^a-z0-9._\-/ ]/g, "").trim().slice(0, max);
  return s || undefined;
}

export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  if (!readConsent()?.analytics) return;
  try {
    if (window.localStorage.getItem(KEY)) return; // first touch wins
    const q = new URLSearchParams(window.location.search);
    let source = clean(q.get("utm_source"));
    const medium = clean(q.get("utm_medium"));
    const campaign = clean(q.get("utm_campaign"));
    const ref = clean(q.get("ref"));
    if (!source && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname.replace(/^www\./, "");
        if (host && !host.endsWith("gysm.io")) source = clean(host);
      } catch {
        /* unparseable referrer: ignore */
      }
    }
    const a: Attribution = { source: source || "direct", medium, campaign, ref, landing: clean(window.location.pathname, 80), ts: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* storage blocked: attribution is simply unavailable */
  }
}

export function readAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const a = JSON.parse(raw) as Attribution;
    const out: Record<string, string> = {};
    if (a.source) out.attr_source = a.source;
    if (a.medium) out.attr_medium = a.medium;
    if (a.campaign) out.attr_campaign = a.campaign;
    if (a.ref) out.attr_ref = a.ref;
    if (a.landing) out.attr_landing = a.landing;
    return out;
  } catch {
    return {};
  }
}
