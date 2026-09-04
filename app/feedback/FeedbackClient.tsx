"use client";

import { useState } from "react";

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "planned" | "in_progress" | "shipped" | "declined";
  votes: number;
  voted: boolean;
  user_id: string;
};

const STATUS_LABEL: Record<Item["status"], string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

const STATUS_STYLE: Record<Item["status"], string> = {
  open: "bg-black/5 text-black/50",
  planned: "bg-sky-500/10 text-sky-700",
  in_progress: "bg-amber-500/10 text-amber-700",
  shipped: "bg-emerald-500/10 text-emerald-700",
  declined: "bg-red-500/10 text-red-600",
};

const STATUS_OPTIONS: Item["status"][] = ["open", "planned", "in_progress", "shipped", "declined"];

// New-idea form -- open to any signed-in user (unlike RoadmapAdminForm,
// which only ever renders for an admin). An anonymous visitor sees a
// sign-in prompt instead of the fields, same redirect_url pattern the
// vote button below uses.
function SubmitForm({ signedIn, onCreated }: { signedIn: boolean; onCreated: (id: string, title: string, description: string) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  // Honeypot -- see app/api/feedback/route.ts and the identical pattern in
  // MarketplaceClient.tsx. Signing in is already a real barrier here, but
  // this is a new open-write surface (any signed-in user, no admin gate)
  // and the check costs nothing.
  const [website, setWebsite] = useState("");

  if (!signedIn) {
    return (
      <div className="mb-8 rounded-2xl border border-dashed border-black/20 bg-black/[0.02] p-5 text-center">
        <p className="text-[13px] text-black/50 mb-3">Sign in to post your own idea.</p>
        <a
          href={`/sign-in?redirect_url=${encodeURIComponent("/feedback")}`}
          className="inline-block px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold"
        >
          Sign in
        </a>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || posting) return;
    setPosting(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Failed to submit feedback.");
        return;
      }
      onCreated(data.id, title.trim(), description.trim());
      setTitle("");
      setDescription("");
    } catch {
      setError("Failed to submit feedback.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-8 rounded-2xl border border-dashed border-black/20 bg-black/[0.02] p-5 flex flex-col gap-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-black/40">Got an idea?</div>
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What should we build?"
        className="text-[13px] rounded-lg border border-black/10 px-3 py-2"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Any more detail? (optional)"
        rows={2}
        className="text-[13px] rounded-lg border border-black/10 px-3 py-2 resize-none"
      />
      <button
        type="submit"
        disabled={!title.trim() || posting}
        className="self-start px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold disabled:opacity-40"
      >
        {posting ? "Posting…" : "Post idea"}
      </button>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </form>
  );
}

function VoteButton({ item, signedIn, onToggle }: { item: Item; signedIn: boolean; onToggle: (id: string) => void }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!signedIn) {
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent("/feedback")}`;
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/feedback/${item.id}/vote`, { method: "POST" });
      onToggle(item.id);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`flex flex-col items-center justify-center w-14 h-14 shrink-0 rounded-xl border font-black transition ${
        item.voted
          ? "bg-black text-white border-black"
          : "bg-white text-black border-black/10 hover:border-black/30"
      } disabled:opacity-50`}
    >
      <span className="text-[15px] leading-none">{item.votes}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide mt-0.5 opacity-60">votes</span>
    </button>
  );
}

export default function FeedbackClient({
  initialItems,
  signedIn,
  isAdmin,
  currentUserId,
}: {
  initialItems: Item[];
  signedIn: boolean;
  isAdmin?: boolean;
  currentUserId: string | null;
}) {
  const [items, setItems] = useState(initialItems);

  function addLocal(id: string, title: string, description: string) {
    setItems((prev) => [
      { id, title, description: description || null, status: "open", votes: 0, voted: false, user_id: currentUserId || "" },
      ...prev,
    ]);
  }

  async function remove(id: string) {
    if (!confirm("Delete this feedback item?")) return;
    await fetch(`/api/feedback/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function setStatus(id: string, status: Item["status"]) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  function toggle(id: string) {
    setItems((prev) =>
      prev
        .map((it) => (it.id === id ? { ...it, voted: !it.voted, votes: it.votes + (it.voted ? -1 : 1) } : it))
        .sort((a, b) => b.votes - a.votes)
    );
  }

  return (
    <div>
      <SubmitForm signedIn={signedIn} onCreated={addLocal} />

      {items.length === 0 ? (
        <p className="text-black/40 text-[14px]">Nothing on the board yet -- be the first to post an idea.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-4 rounded-2xl border border-black/10 bg-white p-5">
              <VoteButton item={item} signedIn={signedIn} onToggle={toggle} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-[15px]">{item.title}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLE[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                {item.description && <p className="mt-1 text-[13px] text-black/50">{item.description}</p>}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={item.status}
                    onChange={(e) => setStatus(item.id, e.target.value as Item["status"])}
                    className="text-[11px] rounded-lg border border-black/10 px-1.5 py-1"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(item.id)}
                    className="text-[11px] font-bold text-black/30 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
