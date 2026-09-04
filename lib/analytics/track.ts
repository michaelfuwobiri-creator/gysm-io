"use client";

import { track as vercelTrack } from "@vercel/analytics";
import { readConsent } from "@/app/components/CookieConsent";

export type AnalyticsEvent =
  | "project_created"
  | "build_clicked"
  | "template_viewed"
  | "checkout_started";

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  if (!readConsent()?.analytics) return;

  try { window.posthog?.capture(name, props); } catch (err) { console.error("[analytics] posthog capture failed:", err); }
  try { window.gtag?.("event", name, props); } catch (err) { console.error("[analytics] gtag event failed:", err); }
  try { vercelTrack(name, props); } catch (err) { console.error("[analytics] vercel track failed:", err); }
}
