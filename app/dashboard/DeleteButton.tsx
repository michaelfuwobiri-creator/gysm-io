"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
};

// Dashboard-card delete. Requires a second click ("Confirm?") before it
// actually calls DELETE /api/projects/[id] -- that route is scoped to
// user_id in its WHERE clause, so this can only ever remove one of the
// signed-in user's own builds. On success we just refresh the server
// component so the card list re-reads from Neon.
export default function DeleteButton({ projectId }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function del() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to delete.");
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to delete. Try again.");
      setDeleting(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex gap-2">
        <button
          onClick={del}
          disabled={deleting}
          className="flex-1 text-center px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="px-3 py-2 rounded-lg border border-black/10 text-xs font-bold disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setConfirming(true)}
        className="w-full text-center px-3 py-2 rounded-lg border border-red-300 text-red-600 text-xs font-bold hover:bg-red-50"
      >
        Delete
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
