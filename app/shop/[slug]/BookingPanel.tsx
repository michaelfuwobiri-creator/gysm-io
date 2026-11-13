"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/stores/core";

export type Service = { id: string; name: string; description: string; duration_min: number; price_cents: number };

function localDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Customer side of bookings: pick a service, a day and a time, then book (and pay on Stripe when it costs money). */
export default function BookingPanel({ slug, services, currency, canBook }: { slug: string; services: Service[]; currency: string; canBook: boolean }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(localDate(1));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [tz, setTz] = useState<string>("");
  const [start, setStart] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const service = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!canBook || !serviceId || !date) return;
    let cancelled = false;
    setSlots(null);
    setStart(null);
    fetch(`/api/stores/slots?slug=${encodeURIComponent(slug)}&service=${serviceId}&date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSlots(Array.isArray(d.slots) ? d.slots : []);
        if (d.timezone) setTz(d.timezone);
      })
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [slug, serviceId, date, canBook]);

  const label = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso));

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!start) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/stores/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, serviceId, start, ...form }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setBusy(false);
    if (res.ok && data.confirmed) {
      setDone(`You're booked for ${service?.name} on ${data.when}. A confirmation email is on its way.`);
      return;
    }
    setError(data.error || "Booking isn't available right now.");
  }

  if (done) return <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">{done}</section>;

  return (
    <section className="rounded-2xl border border-neutral-200 p-5">
      <h2 className="text-lg font-semibold">Book an appointment</h2>
      {!canBook && <p className="mt-2 text-sm text-neutral-500">Bookings open when the store opens.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-neutral-600">
          Service
          <select className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.duration_min} min · {s.price_cents ? formatMoney(s.price_cents, currency) : "free"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-neutral-600">
          Day
          <input type="date" className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" min={localDate(0)} max={localDate(60)} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {service?.description && <p className="mt-3 text-sm text-neutral-500">{service.description}</p>}

      {canBook && (
        <div className="mt-4">
          {slots === null && <p className="text-sm text-neutral-500">Checking times…</p>}
          {slots?.length === 0 && <p className="text-sm text-neutral-500">No free times that day. Try another day.</p>}
          <div className="flex flex-wrap gap-2">
            {slots?.map((s) => (
              <button key={s} type="button" onClick={() => setStart(s)}
                className={`rounded-full border px-3 py-1.5 text-sm ${start === s ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}>
                {label(s)}
              </button>
            ))}
          </div>
          {tz && slots && slots.length > 0 && <p className="mt-2 text-xs text-neutral-400">Times are in {tz.replace("_", " ")}.</p>}
        </div>
      )}

      {start && (
        <form onSubmit={book} className="mt-5 grid gap-3 sm:grid-cols-2">
          <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Your name" value={form.name} maxLength={100} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="rounded-lg border border-neutral-300 px-3 py-2" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className="rounded-lg border border-neutral-300 px-3 py-2" placeholder="Note (optional)" value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <button className="rounded-full bg-[#FF0080] py-2.5 font-semibold text-white disabled:opacity-40 sm:col-span-2" disabled={busy}>
            {busy ? "Booking…" : service?.price_cents ? `Pay ${formatMoney(service.price_cents, currency)} and book` : "Book"}
          </button>
        </form>
      )}
    </section>
  );
}
