"use client";

import { useState } from "react";

type Connector = {
  key: string;
  name: string;
  blurb: string;
  letter: string;
  gradient: string;
};

// Kept in sync with REQUESTABLE_CONNECTORS in
// app/api/connectors/request/route.ts -- deliberately a short, curated
// list rather than trying to look like a big catalog we don't actually
// have.
const COMING_SOON: Connector[] = [
  { key: "stripe", name: "Stripe", blurb: "Accept real payments inside any build you generate.", letter: "S", gradient: "from-indigo-500 to-violet-600" },
  { key: "gmail", name: "Gmail", blurb: "Send and read email from a build's own inbox.", letter: "G", gradient: "from-red-500 to-orange-400" },
  { key: "slack", name: "Slack", blurb: "Post updates or notifications straight to a channel.", letter: "S", gradient: "from-fuchsia-500 to-purple-600" },
  { key: "google-sheets", name: "Google Sheets", blurb: "Read and write rows in a spreadsheet you own.", letter: "G", gradient: "from-emerald-500 to-teal-600" },
  { key: "notion", name: "Notion", blurb: "Sync content to and from a Notion workspace.", letter: "N", gradient: "from-zinc-600 to-zinc-800" },
  { key: "airtable", name: "Airtable", blurb: "Use an Airtable base as a build's database.", letter: "A", gradient: "from-yellow-500 to-orange-500" },
];

function ConnectorCard({ connector, requested, onRequest, loading }: {
  connector: Connector;
  requested: boolean;
  onRequest: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-[10px] bg-gradient-to-br ${connector.gradient} grid place-items-center text-white font-black shrink-0`}>
          {connector.letter}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[15px]">{connector.name}</div>
        </div>
      </div>
      <p className="text-white/45 text-[13px] flex-1">{connector.blurb}</p>
      <button
        onClick={onRequest}
        disabled={requested || loading}
        className={`px-4 py-2 rounded-lg text-[13px] font-bold transition ${
          requested
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default"
            : "bg-white text-black hover:bg-white/90 disabled:opacity-40"
        }`}
      >
        {requested ? "Requested ✓" : loading ? "Requesting…" : "Request access"}
      </button>
    </div>
  );
}

export default function ConnectorsClient({ initialRequested }: { initialRequested: string[] }) {
  const [requested, setRequested] = useState<Set<string>>(new Set(initialRequested));
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function request(key: string) {
    if (requested.has(key) || loadingKey) return;
    setLoadingKey(key);
    try {
      const res = await fetch("/api/connectors/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connector: key }),
      });
      if (res.ok) {
        setRequested((prev) => new Set(prev).add(key));
      }
    } catch {
      // non-critical -- button just stays clickable to retry
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.16),transparent_60%)]" />
      <div className="max-w-5xl mx-auto relative">
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight">Connectors</h1>
          <p className="text-white/40 text-sm mt-1">Build from what you already use.</p>
        </div>

        <div className="mb-10">
          <h2 className="text-sm font-bold text-white/40 uppercase tracking-wider mb-4">Available now</h2>
          <div className="bg-white/[0.04] border border-emerald-500/20 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white font-black shrink-0">
                S
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2">
                  Supabase
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-white/45 text-[13px] mt-0.5">
                  Give any build its own real Postgres database and auth -- connect it from that build's toolbar.
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-white text-black text-[13px] font-bold hover:bg-white/90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white/40 uppercase tracking-wider">Coming soon</h2>
            <p className="text-white/30 text-[12px]">Tell us what you want built next.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMING_SOON.map((c) => (
              <ConnectorCard
                key={c.key}
                connector={c}
                requested={requested.has(c.key)}
                loading={loadingKey === c.key}
                onRequest={() => request(c.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
