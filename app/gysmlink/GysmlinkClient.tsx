"use client";

import { useCallback, useEffect, useState } from "react";
import { THEMES, MAX_BIO, MAX_NAME, MAX_TITLE, pageUrl, type PageStats } from "@/lib/gysmlinkCore";

type Page = { handle: string; display_name: string; bio: string; theme: string; published: boolean };
type Link = { id: string; title: string; url: string; active: boolean };

const input = "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] focus:outline-none focus:border-black/40";
const btn = "rounded-lg bg-black text-white text-[12px] font-semibold px-3 py-2 disabled:opacity-40";
const ghost = "text-[12px] text-black/50 hover:text-black px-1.5";

export default function GysmlinkClient() {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [notReady, setNotReady] = useState("");
  const [exists, setExists] = useState(false);
  const [page, setPage] = useState<Page>({ handle: "", display_name: "", bio: "", theme: "midnight", published: true });
  const [links, setLinks] = useState<Link[]>([]);
  const [stats, setStats] = useState<PageStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [qr, setQr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gysmlink");
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Couldn't load.");
        return;
      }
      if (data.ready === false) {
        setReady(false);
        setNotReady(data.message || "");
        return;
      }
      if (data.page) {
        setExists(true);
        setPage({ handle: data.page.handle, display_name: data.page.display_name, bio: data.page.bio, theme: data.page.theme, published: data.page.published });
      }
      setLinks(data.links || []);
      setStats(data.stats || null);
    } catch {
      setErr("Couldn't load. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const url = exists && typeof window !== "undefined" ? pageUrl(window.location.origin, page.handle) : "";

  useEffect(() => {
    let cancelled = false;
    if (!url) return;
    import("qrcode")
      .then((m) => m.toDataURL(url, { width: 512, margin: 2 }))
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(""));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function savePage() {
    setSaving(true);
    setErr("");
    setNote("");
    try {
      const res = await fetch("/api/gysmlink", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(page) });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Couldn't save.");
        return;
      }
      setExists(true);
      setPage((p) => ({ ...p, handle: data.page.handle }));
      setNote("Saved.");
      load();
    } catch {
      setErr("Couldn't save. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function addLink() {
    setErr("");
    const res = await fetch("/api/gysmlink/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle, url: newUrl }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error || "Couldn't add the link.");
    setNewTitle("");
    setNewUrl("");
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setErr("");
    const res = await fetch(`/api/gysmlink/links/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(data.error || "Couldn't update.");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this link?")) return;
    const res = await fetch(`/api/gysmlink/links/${id}`, { method: "DELETE" });
    if (!res.ok) return setErr("Couldn't delete.");
    load();
  }

  if (loading) return <p className="text-[13px] text-black/40">Loading…</p>;
  if (!ready) return <p className="text-[13px] text-black/60">{notReady || "gysmlink isn't enabled on this deployment yet."}</p>;

  const clicksFor = (id: string) => stats?.perLink.find((l) => l.id === id);

  return (
    <div className="space-y-8">
      {err && <p className="text-[13px] text-red-600">{err}</p>}

      <section className="rounded-xl border border-black/10 p-4 space-y-3">
        <h2 className="text-[14px] font-bold">Your page</h2>
        <div>
          <label className="text-[11px] text-black/50">Handle (gysm.io/l/…)</label>
          <input className={input} value={page.handle} onChange={(e) => setPage({ ...page, handle: e.target.value })} placeholder="yourname" maxLength={30} />
        </div>
        <div>
          <label className="text-[11px] text-black/50">Display name</label>
          <input className={input} value={page.display_name} onChange={(e) => setPage({ ...page, display_name: e.target.value })} maxLength={MAX_NAME} />
        </div>
        <div>
          <label className="text-[11px] text-black/50">Bio</label>
          <textarea className={input} rows={2} value={page.bio} onChange={(e) => setPage({ ...page, bio: e.target.value })} maxLength={MAX_BIO} />
        </div>
        <div>
          <label className="text-[11px] text-black/50">Theme</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {THEMES.map((t) => (
              <button
                key={t}
                onClick={() => setPage({ ...page, theme: t })}
                className={`px-3 py-1 rounded-full text-[12px] capitalize border ${page.theme === t ? "bg-black text-white border-black" : "border-black/15 text-black/60"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-black/60">
          <input type="checkbox" checked={page.published} onChange={(e) => setPage({ ...page, published: e.target.checked })} /> Page is live
        </label>
        <div className="flex items-center gap-3">
          <button className={btn} onClick={savePage} disabled={saving || !page.handle.trim()}>
            {saving ? "Saving…" : exists ? "Save changes" : "Create my page"}
          </button>
          {note && <span className="text-[12px] text-emerald-600">{note}</span>}
          {exists && url && (
            <a href={url} target="_blank" rel="noreferrer" className="text-[12px] underline text-black/60">
              {url}
            </a>
          )}
        </div>
      </section>

      {exists && (
        <>
          <section className="rounded-xl border border-black/10 p-4 space-y-3">
            <h2 className="text-[14px] font-bold">Links</h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={input} placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={MAX_TITLE} />
              <input className={input} placeholder="https://…" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
              <button className={btn} onClick={addLink} disabled={!newTitle.trim() || !newUrl.trim()}>
                Add
              </button>
            </div>
            {links.length === 0 ? (
              <p className="text-[12px] text-black/40">No links yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {links.map((l, i) => {
                  const s = clicksFor(l.id);
                  return (
                    <li key={l.id} className="py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] truncate ${l.active ? "" : "text-black/30 line-through"}`}>{l.title}</p>
                        <p className="text-[11px] text-black/40 truncate">{l.url}</p>
                      </div>
                      <span className="text-[11px] text-black/50 whitespace-nowrap">
                        {s?.clicks ?? 0} clicks{stats && stats.views > 0 ? ` · ${Math.round((s?.ctr ?? 0) * 100)}%` : ""}
                      </span>
                      <button className={ghost} disabled={i === 0} onClick={() => patch(l.id, { move: "up" })} aria-label="Move up">
                        ↑
                      </button>
                      <button className={ghost} disabled={i === links.length - 1} onClick={() => patch(l.id, { move: "down" })} aria-label="Move down">
                        ↓
                      </button>
                      <button className={ghost} onClick={() => patch(l.id, { active: !l.active })}>
                        {l.active ? "Hide" : "Show"}
                      </button>
                      <button className={ghost} onClick={() => remove(l.id)}>
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-black/10 p-4">
            <h2 className="text-[14px] font-bold mb-3">Last 30 days</h2>
            {stats ? (
              <div className="grid grid-cols-3 gap-3 text-center mb-4">
                <div><p className="text-xl font-black">{stats.views}</p><p className="text-[11px] text-black/40">Page views</p></div>
                <div><p className="text-xl font-black">{stats.clicks}</p><p className="text-[11px] text-black/40">Link clicks</p></div>
                <div><p className="text-xl font-black">{Math.round(stats.ctr * 100)}%</p><p className="text-[11px] text-black/40">Click-through</p></div>
              </div>
            ) : null}
            <div className="grid sm:grid-cols-2 gap-4 text-[12px]">
              <div>
                <p className="font-semibold mb-1">Top referrers</p>
                {stats && stats.referrers.length > 0 ? stats.referrers.map((r) => <p key={r.name} className="text-black/60">{r.name} · {r.count}</p>) : <p className="text-black/40">No visits yet.</p>}
              </div>
              <div>
                <p className="font-semibold mb-1">Devices</p>
                {stats && stats.devices.length > 0 ? stats.devices.map((r) => <p key={r.name} className="text-black/60 capitalize">{r.name} · {r.count}</p>) : <p className="text-black/40">No visits yet.</p>}
              </div>
            </div>
            <p className="text-[11px] text-black/30 mt-3">Bots and link-preview crawlers are not counted.</p>
          </section>

          <section className="rounded-xl border border-black/10 p-4 flex items-center gap-4">
            {qr ? <img src={qr} alt="QR code for your page" className="h-28 w-28 rounded-lg border border-black/10" /> : <div className="h-28 w-28 rounded-lg bg-black/5" />}
            <div>
              <h2 className="text-[14px] font-bold">QR code</h2>
              <p className="text-[12px] text-black/50 mb-2">Print it on cards, flyers or video overlays. It points to {url}.</p>
              {qr && (
                <a href={qr} download={`gysmlink-${page.handle}.png`} className={btn + " inline-block"}>
                  Download PNG
                </a>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
