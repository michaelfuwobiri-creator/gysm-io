"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/stores/core";
import type { ProviderGuide } from "@/lib/stores/integrations";

type Store = {
  id: string; name: string; slug: string; url: string; description: string; currency: string; status: string;
  notify_email: string | null; stripe_account_id: string | null; stripe_charges_enabled: boolean; canSell: boolean;
  db_provider: string; collect_shipping: boolean;
};
type Product = { id: string; name: string; description: string; price_cents: number; image_url: string | null; stock: number | null; active: boolean };
type Order = { id: string; status: string; currency: string; amount_total_cents: number; customer_email: string | null; customer_name: string | null; created_at: string; items: { name: string; quantity: number }[] };
type Connection = { provider: string; status: string; error: string | null; verifiedAt: string | null; config: Record<string, string> };

const card = "rounded-2xl border border-neutral-800 bg-neutral-950 p-5";
const input = "w-full rounded-lg border border-neutral-800 bg-black px-3 py-2";
const pill = "rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50";
const emptyProduct = { name: "", price: "", stock: "", imageUrl: "", description: "" };

export default function StoreManager({ id, guides }: { id: string; guides: ProviderGuide[] }) {
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyProduct);
  const [editing, setEditing] = useState<string | null>(null);
  const [settings, setSettings] = useState({ description: "", notifyEmail: "", collectShipping: true });

  const load = useCallback(async () => {
    const res = await fetch(`/api/stores/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setNotice({ ok: false, text: data.error || "Couldn't load the store." });
    setStore(data.store);
    setProducts(data.products);
    setOrders(data.orders);
    setConnections(data.connections);
    setDbError(data.dbError);
    setSettings({ description: data.store.description ?? "", notifyEmail: data.store.notify_email ?? "", collectShipping: data.store.collect_shipping });
  }, [id]);

  useEffect(() => {
    (async () => {
      // Coming back from Stripe's onboarding: re-check the account first.
      if (new URLSearchParams(window.location.search).get("stripe")) {
        await fetch(`/api/stores/${id}/stripe`);
        window.history.replaceState(null, "", `/stores/${id}`);
      }
      await load();
    })();
  }, [id, load]);

  async function call(url: string, method: string, body?: unknown): Promise<any> {
    setBusy(true);
    setNotice(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNotice({ ok: false, text: data.error || data.message || "Something went wrong." });
      return null;
    }
    return data;
  }

  async function connectStripe() {
    const data = await call(`/api/stores/${id}/stripe`, "POST");
    if (data?.url) window.location.href = data.url;
  }

  async function setStatus(status: string) {
    if (await call(`/api/stores/${id}`, "PATCH", { status })) await load();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (await call(`/api/stores/${id}`, "PATCH", settings)) {
      setNotice({ ok: true, text: "Saved." });
      await load();
    }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form, active: true };
    const ok = editing
      ? await call(`/api/stores/${id}/products/${editing}`, "PATCH", { ...body, active: products.find((p) => p.id === editing)?.active ?? true })
      : await call(`/api/stores/${id}/products`, "POST", body);
    if (ok) {
      setForm(emptyProduct);
      setEditing(null);
      await load();
    }
  }

  function edit(p: Product) {
    setEditing(p.id);
    setForm({ name: p.name, price: (p.price_cents / 100).toFixed(2), stock: p.stock === null ? "" : String(p.stock), imageUrl: p.image_url ?? "", description: p.description });
  }

  async function toggleActive(p: Product) {
    const body = { name: p.name, description: p.description, price: (p.price_cents / 100).toFixed(2), imageUrl: p.image_url ?? "", stock: p.stock ?? "", active: !p.active };
    if (await call(`/api/stores/${id}/products/${p.id}`, "PATCH", body)) await load();
  }

  async function removeProduct(p: Product) {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    if (await call(`/api/stores/${id}/products/${p.id}`, "DELETE")) await load();
  }

  if (!store) return <div className="p-8 text-neutral-400">{notice?.text ?? "Loading…"}</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/stores" className="text-sm text-neutral-500 hover:text-white">← Stores</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{store.name}</h1>
          <a href={store.url} target="_blank" rel="noreferrer" className="text-sm text-[#FF0080] hover:underline">{store.url}</a>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${store.status === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-neutral-800 text-neutral-300"}`}>{store.status}</span>
          {store.status !== "live" ? (
            <button className={`${pill} bg-[#FF0080]`} disabled={busy || !store.stripe_charges_enabled} onClick={() => setStatus("live")} title={store.stripe_charges_enabled ? "" : "Connect Stripe first"}>Open store</button>
          ) : (
            <button className={`${pill} border border-neutral-700`} disabled={busy} onClick={() => setStatus("paused")}>Pause</button>
          )}
        </div>
      </div>

      {notice && <p className={`rounded-lg px-4 py-3 text-sm ${notice.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{notice.text}</p>}
      {dbError && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{dbError}</p>}

      <section className={card}>
        <h2 className="text-lg font-semibold">Payments</h2>
        {store.stripe_charges_enabled ? (
          <p className="mt-2 text-sm text-emerald-300">Payments ready. Customers pay into your own Stripe account.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-400">
              Connect your Stripe account to take card payments. You sign up or sign in on Stripe&apos;s own page; GYSM never holds your money.
            </p>
            <button className={`${pill} mt-4 bg-white text-black`} disabled={busy} onClick={connectStripe}>
              {store.stripe_account_id ? "Finish Stripe setup" : "Connect Stripe"}
            </button>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Products</h2>
        <form onSubmit={saveProduct} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={input} placeholder={`Price (${store.currency.toUpperCase()}), e.g. 12.50`} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <input className={input} placeholder="Stock (empty = unlimited)" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          <input className={input} placeholder="Image link (https://…)" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          <textarea className={`${input} sm:col-span-2`} placeholder="Description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-2 sm:col-span-2">
            <button className={`${pill} bg-[#FF0080]`} disabled={busy}>{editing ? "Save product" : "Add product"}</button>
            {editing && <button type="button" className={`${pill} border border-neutral-700`} onClick={() => { setEditing(null); setForm(emptyProduct); }}>Cancel</button>}
          </div>
        </form>
        <ul className="mt-5 divide-y divide-neutral-900">
          {products.length === 0 && <li className="py-3 text-sm text-neutral-500">No products yet.</li>}
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className={p.active ? "" : "opacity-50"}>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-neutral-500">
                  {formatMoney(p.price_cents, store.currency)} · {p.stock === null ? "unlimited" : `${p.stock} in stock`}{p.active ? "" : " · hidden"}
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <button className="text-neutral-300 hover:text-white" onClick={() => edit(p)}>Edit</button>
                <button className="text-neutral-300 hover:text-white" onClick={() => toggleActive(p)}>{p.active ? "Hide" : "Show"}</button>
                <button className="text-red-400 hover:text-red-300" onClick={() => removeProduct(p)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Orders</h2>
        <ul className="mt-3 divide-y divide-neutral-900">
          {orders.length === 0 && <li className="py-3 text-sm text-neutral-500">No orders yet. You&apos;ll get an email for each paid order.</li>}
          {orders.map((o) => (
            <li key={o.id} className="py-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium">{o.customer_name || o.customer_email || "Customer"}</span>
                <span>{formatMoney(o.amount_total_cents, o.currency)}</span>
              </div>
              <div className="text-neutral-500">
                {new Date(o.created_at).toLocaleString()} · {o.status} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Settings</h2>
        <form onSubmit={saveSettings} className="mt-4 space-y-3">
          <label className="block text-sm text-neutral-400">
            Email for order alerts
            <input className={`${input} mt-1`} type="email" value={settings.notifyEmail} onChange={(e) => setSettings({ ...settings, notifyEmail: e.target.value })} />
          </label>
          <label className="block text-sm text-neutral-400">
            Store description
            <textarea className={`${input} mt-1`} rows={2} value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={settings.collectShipping} onChange={(e) => setSettings({ ...settings, collectShipping: e.target.checked })} />
            Ask customers for a shipping address at checkout
          </label>
          <button className={`${pill} border border-neutral-700`} disabled={busy}>Save settings</button>
        </form>
      </section>

      <section className={card}>
        <h2 className="text-lg font-semibold">Your accounts</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Use your own accounts for the database, sign-in and shipping. Create the account and project on each service, paste the values here, and GYSM checks them and connects them. Secret keys are stored encrypted and never shown again.
          {store.db_provider === "neon" ? " This store's products and orders are saved in your own Neon database." : ""}
        </p>
        <div className="mt-4 space-y-4">
          {guides.filter((g) => g.provider !== "stripe").map((g) => (
            <ProviderCard key={g.provider} storeId={id} guide={g} connection={connections.find((c) => c.provider === g.provider)} onChange={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProviderCard({ storeId, guide, connection, onChange }: { storeId: string; guide: ProviderGuide; connection?: Connection; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pub, setPub] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const verified = connection?.status === "verified";

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/stores/${storeId}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: guide.provider, publicValue: pub, secret }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setSecret("");
    setMsg({ ok: res.ok, text: data.message || data.error || (res.ok ? "Connected." : "Couldn't connect.") });
    if (res.ok) await onChange();
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect ${guide.label}? The saved keys are deleted.`)) return;
    const res = await fetch(`/api/stores/${storeId}/connections?provider=${guide.provider}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: res.ok ? "Disconnected." : data.error || "Couldn't disconnect." });
    if (res.ok) await onChange();
  }

  return (
    <div className="rounded-xl border border-neutral-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{guide.label}</div>
          <div className="text-sm text-neutral-400">{guide.purpose}</div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${verified ? "bg-emerald-500/15 text-emerald-300" : connection ? "bg-red-500/15 text-red-300" : "bg-neutral-800 text-neutral-400"}`}>
          {verified ? "Connected" : connection ? "Needs attention" : "Not connected"}
        </span>
      </div>
      {connection?.error && !verified && <p className="mt-2 text-sm text-red-300">{connection.error}</p>}
      <button className="mt-3 text-sm text-[#FF0080] hover:underline" onClick={() => setOpen(!open)}>
        {open ? "Hide" : verified ? "Replace keys" : "How to connect"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-300">
            {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <a href={guide.signupUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-neutral-300 underline">Open {guide.label.split(" ")[0]}</a>
          <form onSubmit={connect} className="space-y-2">
            {guide.publicField && <input className={input} placeholder={guide.publicField.example} aria-label={guide.publicField.label} value={pub} onChange={(e) => setPub(e.target.value)} required />}
            {guide.secretField && <input className={input} type="password" autoComplete="off" placeholder={guide.secretField.label} aria-label={guide.secretField.label} value={secret} onChange={(e) => setSecret(e.target.value)} required />}
            <div className="flex gap-2">
              <button className={`${pill} bg-white text-black`} disabled={busy}>{busy ? "Checking…" : "Check and connect"}</button>
              {connection && <button type="button" className={`${pill} border border-neutral-700`} onClick={disconnect}>Disconnect</button>}
            </div>
          </form>
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
    </div>
  );
}
