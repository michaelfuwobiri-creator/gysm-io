"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getPlanById } from "@/lib/stripe";
import { trackEvent } from "@/lib/analytics/track";

// No useUser() here -- see app/components/NavAuthLink.tsx for why. This
// component only ever needed the user for an imperative check inside a
// click handler (never during render), so reading Clerk's own global
// object directly avoids calling the hook at all, sidestepping the
// hydration mismatch calling useUser() from any SSR-participating
// component was causing (confirmed live: this exact component, unused
// result and all, was one of the three reproductions).
export default function CheckoutButton({
  planId,
  label,
  highlight,
}: {
  planId: string;
  label: string;
  highlight?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    trackEvent("checkout_started", { planId });
    setLoading(true);
    setError("");
    try {
      // Inside the native iOS app, purchases must go through StoreKit
      // (Apple Guideline 3.1.1) rather than a Stripe redirect -- everything
      // else (web, and the Android TWA, which is just a browser tab) keeps
      // using the existing Stripe checkout below unchanged.
      const { isNativeIOSApp } = await import("@/lib/iap-client");
      if (await isNativeIOSApp()) {
        const clerkUser = (window as any).Clerk?.user;
        if (!clerkUser) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/pricing")}`);
          return;
        }
        const plan = getPlanById(planId);
        if (!plan) throw new Error(`Unknown plan "${planId}".`);

        const { purchasePlanNative } = await import("@/lib/iap-client");
        await purchasePlanNative(plan, clerkUser.id);
        router.push("/builder?success=true&source=iap");
        return;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/pricing")}`);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`mt-6 w-full h-11 rounded-full font-bold disabled:opacity-50 ${
          highlight ? "bg-black text-white" : "bg-white text-black border border-black/10"
        }`}
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
