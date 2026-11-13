"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { slugify, SUPPORTED_CURRENCIES } from "@/lib/stores/core";

type Store = { id: string; name: string; slug: string; status: string; url: string; stripe_charges_enabled: boolean; db_provider: string };

export default function StoresClient() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [currency, setCurrency] = useState("eur");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/stores");
    const data = await res.json().catch(() => ({}));
    setStores(res.ok ? data.stores : []);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: slug || slugify(name), currency }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Couldn't create the store.");
    window.location.href = `/stores/${data.store.id}`;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 text-white">
      <h1 className="text-3xl font-semibold tracking-tight">Stores</h1>
      <p className="mt-2 text-neutral-400">
        An online store with products, checkout and order alerts. Customers pay into your own Stripe account.
      </p>

      <form onSubmit={create} className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
        <h2 className="text-lg font-semibold">New store</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
          <input
            className="rounded-lg border border-neutral-800 bg-black px-3 py-2"
            placeholder="Store name, e.g. Mia's Bakery"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
          />
          <input
            className="rounded-lg border border-neutral-800 bg-black px-3 py-2"
            placeholder="address"
            value={slug}
            maxLength={40}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
          <select className="rounded-lg border border-neutral-800 bg-black px-3 py-2" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <button disabled={busy || !name.trim()} className="mt-4 rounded-full bg-[#FF0080] px-5 py-2 font-semibold disabled:opacity-50">
          {busy ? "Creating…" : "Create store"}
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {stores === null && <p className="text-neutral-500">Loading…</p>}
        {stores?.length === 0 && <p className="text-neutral-500">No stores yet.</p>}
        {stores?.map((s) => (
          <Link key={s.id} href={`/stores/${s.id}`} className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-950 p-4 hover:border-neutral-600">
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-neutral-500">{s.url}</div>
            </div>
            <div className="text-right text-sm">
              <div className={s.status === "live" ? "text-emerald-400" : "text-neutral-400"}>{s.status}</div>
              <div className="text-neutral-500">{s.stripe_charges_enabled ? "Payments ready" : "Stripe not connected"}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
