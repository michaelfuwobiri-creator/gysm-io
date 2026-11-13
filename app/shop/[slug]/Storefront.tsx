"use client";

import { useMemo, useState } from "react";
import { formatMoney, MAX_QUANTITY } from "@/lib/stores/core";
import BookingPanel, { type Service } from "./BookingPanel";

type Product = { id: string; name: string; description: string; price_cents: number; image_url: string | null; stock: number | null };
type StoreInfo = { slug: string; name: string; description: string; currency: string; status: string };

export default function Storefront({
  store, products, canSell, services = [], canBook = false,
}: { store: StoreInfo; products: Product[]; canSell: boolean; services?: Service[]; canBook?: boolean }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => products.filter((p) => cart[p.id]).map((p) => ({ product: p, quantity: cart[p.id] })), [products, cart]);
  const total = lines.reduce((sum, l) => sum + l.product.price_cents * l.quantity, 0);

  function add(p: Product, delta: number) {
    setCart((c) => {
      const max = Math.min(MAX_QUANTITY, p.stock ?? MAX_QUANTITY);
      const next = Math.max(0, Math.min(max, (c[p.id] ?? 0) + delta));
      const copy = { ...c };
      if (next === 0) delete copy[p.id];
      else copy[p.id] = next;
      return copy;
    });
  }

  async function checkout() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stores/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: store.slug, items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setBusy(false);
    setError(data.error || "Checkout isn't available right now.");
  }

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
            {store.description && <p className="mt-1 text-sm text-neutral-500">{store.description}</p>}
          </div>
          {store.status === "draft" && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">Preview, only you can see this</span>}
        </div>
      </header>

      {services.length > 0 && (
        <div className="mx-auto max-w-5xl px-4 pt-8">
          <BookingPanel slug={store.slug} services={services} currency={store.currency} canBook={canBook} />
        </div>
      )}

      {(products.length > 0 || services.length === 0) && (
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_300px]">
        <section className="grid gap-5 sm:grid-cols-2">
          {products.length === 0 && <p className="text-neutral-500">No products yet.</p>}
          {products.map((p) => {
            const soldOut = p.stock === 0;
            return (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-neutral-200">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square w-full bg-neutral-100" />
                )}
                <div className="p-4">
                  <h2 className="font-semibold">{p.name}</h2>
                  {p.description && <p className="mt-1 line-clamp-3 text-sm text-neutral-500">{p.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-medium">{formatMoney(p.price_cents, store.currency)}</span>
                    {soldOut ? (
                      <span className="text-sm text-neutral-400">Sold out</span>
                    ) : (
                      <button className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40" disabled={!canSell} onClick={() => add(p, 1)}>
                        Add
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="h-fit rounded-2xl border border-neutral-200 p-5 lg:sticky lg:top-6">
          <h2 className="font-semibold">Cart</h2>
          {!canSell && <p className="mt-2 text-sm text-neutral-500">This store isn&apos;t taking orders yet.</p>}
          {lines.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Your cart is empty.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {lines.map((l) => (
                <li key={l.product.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1">{l.product.name}</span>
                  <span className="flex items-center gap-2">
                    <button aria-label="Remove one" className="h-6 w-6 rounded-full border" onClick={() => add(l.product, -1)}>−</button>
                    {l.quantity}
                    <button aria-label="Add one" className="h-6 w-6 rounded-full border" onClick={() => add(l.product, 1)}>+</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4 font-semibold">
            <span>Total</span>
            <span>{formatMoney(total, store.currency)}</span>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-full bg-[#FF0080] py-2.5 font-semibold text-white disabled:opacity-40" disabled={!canSell || lines.length === 0 || busy} onClick={checkout}>
            {busy ? "Opening checkout…" : "Checkout"}
          </button>
          <p className="mt-3 text-center text-xs text-neutral-400">Secure payment by Stripe · Built with GYSM</p>
        </aside>
      </div>
      )}
    </main>
  );
}
