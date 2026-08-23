"use client";

import { useState } from "react";

type Key = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export default function ApiKeysClient({ initialKeys }: { initialKeys: Key[] }) {
  const [keys, setKeys] = useState(initialKeys.filter((k) => !k.revoked_at));
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled key" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to create key.");
        return;
      }
      setNewRawKey(data.key);
      setKeys((prev) => [{ id: data.id, name: data.name, key_prefix: data.keyPrefix, created_at: data.createdAt, last_used_at: null, revoked_at: null }, ...prev]);
      setName("");
    } catch {
      setError("Failed to create key.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      {newRawKey && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-2">
            Copy this now -- it won't be shown again
          </div>
          <code className="block text-[13px] font-mono bg-white border border-black/10 rounded-lg px-3 py-2 break-all">
            {newRawKey}
          </code>
          <button
            onClick={() => setNewRawKey(null)}
            className="mt-3 text-[12px] font-semibold text-black/50 hover:text-black"
          >
            Done, I've saved it
          </button>
        </div>
      )}

      <form onSubmit={createKey} className="rounded-2xl border border-black/10 bg-white p-5 flex items-end gap-3">
        <div className="flex-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-1 block">Key name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My CLI script"
            className="w-full text-[13px] rounded-lg border border-black/10 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>
      {error && <p className="text-[12px] text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {keys.length === 0 && <p className="text-[13px] text-black/40">No API keys yet.</p>}
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="text-[13px] font-bold">{k.name}</div>
              <div className="text-[11px] text-black/40 font-mono">{k.key_prefix}…</div>
              <div className="text-[11px] text-black/30">
                Created {new Date(k.created_at).toLocaleDateString("en-US", { timeZone: "UTC" })}
                {k.last_used_at && ` • last used ${new Date(k.last_used_at).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
              </div>
            </div>
            <button
              onClick={() => revoke(k.id)}
              className="text-[12px] font-bold text-red-600 hover:underline shrink-0"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
