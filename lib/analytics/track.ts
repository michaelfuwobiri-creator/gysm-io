"use client";

import { track as vercelTrack } from "@vercel/analytics";
import { readConsent } from "@/app/components/CookieConsent";
import { readAttribution } from "@/lib/analytics/attribution";

export type AnalyticsEvent =
  | "project_created"
  | "build_clicked"
  | "template_viewed"
  | "checkout_started"
  // Growth funnel (blueprint widget and use-case pages): what visitors try,
  // whether the plan lands, and whether they continue into the builder.
  | "blueprint_example_clicked"
  | "blueprint_idea_typed"
  | "blueprint_shown"
  | "blueprint_cta_clicked"
  | "usecase_viewed"
  | "nudge_shown";

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  if (!readConsent()?.analytics) return;

  // First-touch channel (consent-gated, see attribution.ts) rides along on
  // every event so each step can be sliced by where the visitor came from.
  props = { ...readAttribution(), ...props };

  try { window.posthog?.capture(name, props); } catch (err) { console.error("[analytics] posthog capture failed:", err); }
  try { window.gtag?.("event", name, props); } catch (err) { console.error("[analytics] gtag event failed:", err); }
  try { vercelTrack(name, props); } catch (err) { console.error("[analytics] vercel track failed:", err); }
}
