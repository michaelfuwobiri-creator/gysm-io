"use client";

import { useEffect, useState } from "react";

export default function BillingClient({ hasSubscription }: { hasSubscription: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [native, setNative] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState("");

  // Inside the iOS app, Apple requires subscriptions to be managed through
  // the App Store (Guideline 3.1.1) -- never link out to Stripe from there.
  useEffect(() => {
    import("@/lib/iap-client")
      .then((m) => m.isNativeIOSApp())
      .then(setNative)
      .catch(() => setNative(false));
  }, []);

  async function restore() {
    setLoading(true);
    setRestoreMsg("");
    try {
      const clerkUser = (window as any).Clerk?.user;
      if (!clerkUser) {
        setRestoreMsg("Please sign in first.");
        return;
      }
      const { restorePurchasesNative } = await import("@/lib/iap-client");
      await restorePurchasesNative(clerkUser.id);
      setRestoreMsg("Purchases restored. Your plan will update in a moment.");
    } catch {
      setRestoreMsg("Couldn't restore purchases. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data?.error || "Could not open billing portal.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not open billing portal. Please try again.");
      setLoading(false);
    }
  }

  if (native) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <p className="text-[14px] text-black/60 mb-4">
          Subscriptions bought in the app are managed in your Apple ID settings. You can change or cancel a plan there,
          or restore a purchase you made earlier.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="itms-apps://apps.apple.com/account/subscriptions"
            className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-bold hover:opacity-90"
          >
            Manage subscription
          </a>
          <button
            onClick={restore}
            disabled={loading}
            className="px-5 py-2.5 rounded-full border border-black/20 text-sm font-bold hover:bg-black/5 disabled:opacity-50"
          >
            {loading ? "Restoring…" : "Restore purchases"}
          </button>
        </div>
        {restoreMsg && <p className="mt-2 text-[12px] text-black/60">{restoreMsg}</p>}
      </div>
    );
  }

  if (!hasSubscription) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <p className="text-[14px] text-black/60">
          You don't have an active subscription.{" "}
          <a href="/pricing" className="font-semibold text-black underline">
            Subscribe to GYSM
          </a>{" "}
          for €20/month to build and publish with the Agent.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-6">
      <p className="text-[14px] text-black/60 mb-4">
        Update your card, view past invoices, or cancel your plan -- handled securely by Stripe.
      </p>
      <button
        onClick={openPortal}
        disabled={loading}
        className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
