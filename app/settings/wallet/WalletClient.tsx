"use client";

import { useEffect, useState } from "react";

type Wallet = { id: string; address: string; linkedAt: string };

// EIP-1193 provider, as injected by wallet extensions / in-app browsers.
type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};
type Discovered = { id: string; name: string; icon?: string; provider: Eip1193 };

function toHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletClient({ initialWallets }: { initialWallets: Wallet[] }) {
  const [wallets, setWallets] = useState<Wallet[]>(initialWallets);
  const [providers, setProviders] = useState<Discovered[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Discover installed wallets with EIP-6963 so we list each one by name
  // instead of fighting over window.ethereum.
  useEffect(() => {
    const found = new Map<string, Discovered>();
    function onAnnounce(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail?.info?.uuid || !detail?.provider) return;
      found.set(detail.info.uuid, {
        id: detail.info.uuid,
        name: detail.info.name || "Wallet",
        icon: detail.info.icon,
        provider: detail.provider,
      });
      setProviders(Array.from(found.values()));
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback for wallets that only set window.ethereum.
    const t = setTimeout(() => {
      const legacy = (window as any).ethereum as Eip1193 | undefined;
      if (found.size === 0 && legacy) {
        found.set("legacy", { id: "legacy", name: "Browser wallet", provider: legacy });
        setProviders(Array.from(found.values()));
      }
      setSearched(true);
    }, 400);

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      clearTimeout(t);
    };
  }, []);

  async function link(p: Discovered) {
    if (busy) return;
    setBusy(p.id);
    setError("");
    setNotice("");
    try {
      const accounts: string[] = await p.provider.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("No account was shared by the wallet.");

      const nonceRes = await fetch("/api/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok) throw new Error(nonceData?.error || "Could not start linking.");

      // The server built this message. We sign it exactly as given.
      const signature: string = await p.provider.request({
        method: "personal_sign",
        params: [toHex(nonceData.message), address],
      });

      const verifyRes = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: nonceData.nonce, signature }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData?.error || "Could not link wallet.");

      setWallets((prev) =>
        prev.some((w) => w.id === verifyData.id)
          ? prev
          : [...prev, { id: verifyData.id, address: verifyData.address, linkedAt: verifyData.linkedAt || new Date().toISOString() }]
      );
      setNotice(verifyData.alreadyLinked ? "That wallet was already linked." : "Wallet linked.");
    } catch (e: any) {
      // 4001 = the user closed or rejected the wallet prompt.
      if (e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || "")) {
        setError("You cancelled the request in your wallet. Nothing was linked.");
      } else {
        setError(e?.message || "Could not link wallet.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function unlink(id: string) {
    if (!confirm("Unlink this wallet from your GYSM account? Your wallet itself is not affected.")) return;
    setError("");
    setNotice("");
    const res = await fetch(`/api/wallet/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWallets((prev) => prev.filter((w) => w.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Could not unlink wallet.");
    }
  }

  const here = typeof window !== "undefined" ? window.location.host + "/settings/wallet" : "gysm.io/settings/wallet";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-black/40">Linked wallets</div>
        {wallets.length === 0 && <p className="text-[13px] text-black/40">No wallet linked yet.</p>}
        {wallets.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="text-[13px] font-bold font-mono truncate" title={w.address}>
                {short(w.address)}
              </div>
              <div className="text-[11px] text-black/30">
                Linked {new Date(w.linkedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}
              </div>
            </div>
            <button onClick={() => unlink(w.id)} className="text-[12px] font-bold text-red-600 hover:underline shrink-0">
              Unlink
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-black/40 mb-3">Link a wallet</div>
        {providers.length > 0 ? (
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => link(p)}
                disabled={!!busy}
                className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-left text-[13px] font-bold hover:bg-black/[0.03] disabled:opacity-40 min-h-[44px]"
              >
                {p.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.icon} alt="" width={24} height={24} className="rounded" />
                ) : (
                  <span className="w-6 h-6 rounded bg-black/10" />
                )}
                <span className="flex-1">{busy === p.id ? "Check your wallet…" : `Link with ${p.name}`}</span>
              </button>
            ))}
          </div>
        ) : searched ? (
          <div className="text-[13px] text-black/60 flex flex-col gap-3">
            <p>
              No wallet was detected in this browser. On a computer, install a wallet extension such as Coinbase
              Wallet, MetaMask or Phantom, then reload. On a phone, open this page inside your wallet app's
              built-in browser:
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="px-4 py-2 rounded-lg border border-black/10 text-[13px] font-bold min-h-[44px] inline-flex items-center"
                href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent("https://" + here)}`}
              >
                Open in Coinbase Wallet
              </a>
              <a
                className="px-4 py-2 rounded-lg border border-black/10 text-[13px] font-bold min-h-[44px] inline-flex items-center"
                href={`https://metamask.app.link/dapp/${here}`}
              >
                Open in MetaMask
              </a>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-black/40">Looking for wallets…</p>
        )}
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {notice && <p className="text-[12px] text-emerald-700">{notice}</p>}
    </div>
  );
}
