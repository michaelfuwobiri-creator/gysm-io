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
  { key: "notion", name: "Notion", blurb: "Sync content to and from a Notion workspace.", letter: "N", gradient: "from-zinc-600 to-zinc-800" },
];

function ConnectorCard({ connector, requested, onRequest, loading }: {
  connector: Connector;
  requested: boolean;
  onRequest: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-white border border-black/5 shadow-sm rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-[10px] bg-gradient-to-br ${connector.gradient} grid place-items-center text-white font-black shrink-0`}>
          {connector.letter}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-[15px] text-black">{connector.name}</div>
        </div>
      </div>
      <p className="text-black/45 text-[13px] flex-1">{connector.blurb}</p>
      <button
        onClick={onRequest}
        disabled={requested || loading}
        className={`px-4 py-2 rounded-lg text-[13px] font-bold transition ${
          requested
            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 cursor-default"
            : "bg-black text-white hover:opacity-90 disabled:opacity-40"
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
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.06),transparent_60%)]" />
      <div className="max-w-5xl mx-auto relative">
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tight">Connectors</h1>
          <p className="text-black/40 text-sm mt-1">Build from what you already use.</p>
        </div>

        <div className="mb-10">
          <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider mb-4">Available now</h2>
          <div className="flex flex-col gap-3">
          <div className="bg-white border border-emerald-500/20 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center text-white font-black shrink-0">
                S
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2 text-black">
                  Supabase
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Give any build its own real Postgres database and auth -- connect it from that build's toolbar.
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold hover:opacity-90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
          <div className="bg-white border border-emerald-500/20 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-yellow-500 to-orange-500 grid place-items-center text-white font-black shrink-0">
                A
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2 text-black">
                  Airtable / Google Sheets
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Import real rows from a base or a published sheet -- connect it from that build's toolbar (\u201cImport data\u201d).
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold hover:opacity-90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
          <div className="bg-white border border-emerald-500/20 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-zinc-700 to-black grid place-items-center text-white font-black shrink-0">
                G
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2 text-black">
                  GitHub
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Push any build to a repo you own, and re-push after edits -- connect it from that build's toolbar (\u201cPush to GitHub\u201d).
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold hover:opacity-90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
          <div className="bg-white border border-emerald-500/20 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-orange-500 to-black grid place-items-center text-white font-black shrink-0">
                P
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2 text-black">
                  PostHog
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Wire real product analytics into a build -- connect it from that build's toolbar (\u201cIntegrations\u201d).
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold hover:opacity-90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
          <div className="bg-white border border-emerald-500/20 shadow-sm rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] bg-gradient-to-br from-black to-zinc-700 grid place-items-center text-white font-black shrink-0">
                R
              </div>
              <div>
                <div className="font-bold text-[15px] flex items-center gap-2 text-black">
                  Resend
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                    Available
                  </span>
                </div>
                <p className="text-black/45 text-[13px] mt-0.5">
                  Give a build a working contact form that actually emails you -- connect it from that build's toolbar (\u201cIntegrations\u201d).
                </p>
              </div>
            </div>
            <a
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-bold hover:opacity-90 transition shrink-0"
            >
              Open your builds →
            </a>
          </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider">Coming soon</h2>
            <p className="text-black/30 text-[12px]">Tell us what you want built next.</p>
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
