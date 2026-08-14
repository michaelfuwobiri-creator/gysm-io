"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    setLoading(true);
    setError("");
    try {
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
