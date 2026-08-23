"use client";

import { useState } from "react";

export default function BillingClient({ hasSubscription }: { hasSubscription: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  if (!hasSubscription) {
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-6">
        <p className="text-[14px] text-black/60">
          You don't have an active monthly subscription to manage. Credit packs are one-time purchases with
          nothing to manage here -- see{" "}
          <a href="/pricing" className="font-semibold text-black underline">
            pricing
          </a>{" "}
          if you'd like to subscribe to a monthly plan.
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
