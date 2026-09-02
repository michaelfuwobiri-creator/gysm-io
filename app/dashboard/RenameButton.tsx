"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  projectId: string;
  initialName: string;
};

// Click-to-edit build name shown on each dashboard card. Saves via
// PATCH /api/projects/[id] (owner-scoped, name-only) and refreshes the
// server component on success so the card re-reads from Neon.
export default function RenameButton({ projectId, initialName }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name can't be empty.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to rename.");
        setSaving(false);
        return;
      }
      setEditing(false);
      setSaving(false);
      router.refresh();
    } catch {
      setError("Failed to rename. Try again.");
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setEditing(false);
                setName(initialName);
                setError("");
              }
            }}
            maxLength={120}
            autoFocus
            className="flex-1 h-8 px-3 rounded-lg bg-white border border-black/15 text-xs outline-none focus:border-[#FF0080]/40"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-bold disabled:opacity-40"
          >
            {saving ? "…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setName(initialName);
              setError("");
            }}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-black/15 text-xs font-bold disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="text-left" title="Click to rename">
      <span className="font-medium line-clamp-2 hover:underline decoration-black/20">{initialName}</span>
    </button>
  );
}
