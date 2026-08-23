"use client";

import { useState } from "react";

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "shipped";
  votes: number;
  voted: boolean;
};

const STATUS_LABEL: Record<Item["status"], string> = {
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
};

const STATUS_STYLE: Record<Item["status"], string> = {
  planned: "bg-black/5 text-black/50",
  in_progress: "bg-amber-500/10 text-amber-700",
  shipped: "bg-emerald-500/10 text-emerald-700",
};

function VoteButton({ item, signedIn, onToggle }: { item: Item; signedIn: boolean; onToggle: (id: string) => void }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!signedIn) {
      window.location.href = `/sign-in?redirect_url=${encodeURIComponent("/roadmap")}`;
      return;
    }
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/roadmap/${item.id}/vote`, { method: "POST" });
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

export default function RoadmapClient({ initialItems, signedIn, isAdmin }: { initialItems: Item[]; signedIn: boolean; isAdmin?: boolean }) {
  const [items, setItems] = useState(initialItems);

  async function remove(id: string) {
    if (!confirm("Delete this roadmap item?")) return;
    await fetch(`/api/roadmap/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function toggle(id: string) {
    setItems((prev) =>
      prev
        .map((it) => (it.id === id ? { ...it, voted: !it.voted, votes: it.votes + (it.voted ? -1 : 1) } : it))
        .sort((a, b) => b.votes - a.votes)
    );
  }

  if (items.length === 0) {
    return <p className="text-black/40 text-[14px]">Nothing on the board yet -- check back soon.</p>;
  }

  return (
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
            <button
              onClick={() => remove(item.id)}
              className="shrink-0 text-[11px] font-bold text-black/30 hover:text-red-600"
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
