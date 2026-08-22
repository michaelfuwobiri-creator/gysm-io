"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
};

// Forks a build into a new, independent project (own id, own version
// chain) via POST /api/projects/[id]/duplicate. Useful before making a
// risky edit, or to branch two directions from the same starting point.
export default function DuplicateButton({ projectId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function duplicate() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to duplicate.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to duplicate. Try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <div className="flex-1">
      <button
        onClick={duplicate}
        disabled={loading}
        className="w-full text-center px-3 py-2 rounded-lg border border-black/10 text-xs font-bold hover:bg-black/[0.03] disabled:opacity-40"
      >
        {loading ? "Duplicating…" : "Duplicate"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
