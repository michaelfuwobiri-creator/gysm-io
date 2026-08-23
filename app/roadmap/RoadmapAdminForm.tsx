"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only add-item form (route itself re-checks isAdminEmail server
// side -- this component only renders for an admin in the first place,
// see app/roadmap/page.tsx, so there's no privilege check to bypass here
// even if someone found a way to render it).
export default function RoadmapAdminForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"planned" | "in_progress" | "shipped">("planned");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || posting) return;
    setPosting(true);
    setError("");
    try {
      const res = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Failed to add item.");
        setPosting(false);
        return;
      }
      setTitle("");
      setDescription("");
      setStatus("planned");
      router.refresh();
    } catch {
      setError("Failed to add item.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-8 rounded-2xl border border-dashed border-black/20 bg-black/[0.02] p-5 flex flex-col gap-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-black/40">Add roadmap item (admin only)</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="text-[13px] rounded-lg border border-black/10 px-3 py-2"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description (optional)"
        rows={2}
        className="text-[13px] rounded-lg border border-black/10 px-3 py-2 resize-none"
      />
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          className="text-[13px] rounded-lg border border-black/10 px-3 py-2"
        >
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="shipped">Shipped</option>
        </select>
        <button
          type="submit"
          disabled={!title.trim() || posting}
          className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold disabled:opacity-40"
        >
          {posting ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </form>
  );
}
