"use client";

import { useEffect, useState } from "react";

type Result = { created: { products: number; pages: number }; problems: string[]; checklist: string[] };

declare global {
  interface Window {
    shopify?: { idToken: () => Promise<string> };
  }
}

// Loads Shopify App Bridge (which supplies the session token), then lets the
// merchant describe their store. The server turns it into DRAFT products and
// unpublished pages in this store; nothing goes live without the merchant.
export default function ShopifyApp({ apiKey }: { apiKey: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [shop, setShop] = useState("");
  const [niche, setNiche] = useState("");
  const [products, setProducts] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function token(): Promise<string> {
    if (!window.shopify) throw new Error("Open this app from your Shopify admin.");
    return window.shopify.idToken();
  }

  useEffect(() => {
    if (!apiKey) {
      setState("error");
      setError("This app is not configured yet.");
      return;
    }
    const meta = document.createElement("meta");
    meta.name = "shopify-api-key";
    meta.content = apiKey;
    document.head.appendChild(meta);
    const s = document.createElement("script");
    s.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
    s.onload = async () => {
      try {
        const t = await token();
        const r = await fetch("/api/shopify/session", { method: "POST", headers: { authorization: `Bearer ${t}` } });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not connect to your store.");
        setShop(j.shop);
        setState("ready");
      } catch (e: any) {
        setError(e?.message || "Could not connect to your store.");
        setState("error");
      }
    };
    s.onerror = () => {
      setError("Could not load Shopify. Open this app from your Shopify admin.");
      setState("error");
    };
    document.head.appendChild(s);
  }, [apiKey]);

  async function build() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const t = await token();
      const list = products
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((l) => {
          const m = l.match(/^(.*?)(?:\s*[-,:|]\s*([^-,:|]*\d[^-,:|]*))?$/);
          return m && m[2] ? { name: m[1].trim(), price: m[2].trim() } : { name: l };
        });
      const r = await fetch("/api/shopify/build", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ niche, products: list, currency }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setResult(j);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e1e3e5", borderRadius: 12, padding: 20, marginBottom: 16 };
  const input: React.CSSProperties = { width: "100%", padding: 10, border: "1px solid #8a8f94", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#202223", background: "#f6f6f7", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 20, margin: "8px 0 4px" }}>GYSM for Shopify</h1>
      <p style={{ margin: "0 0 16px", color: "#5c5f62", fontSize: 14 }}>
        Describe your store in plain English. GYSM creates draft products and starter pages in your store. Nothing is published until you review it.
      </p>

      {state === "loading" && <div style={card}>Connecting to your store…</div>}
      {state === "error" && <div style={{ ...card, borderColor: "#d72c0d" }}>{error}</div>}

      {state === "ready" && (
        <>
          <div style={card}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#5c5f62" }}>Connected to {shop}</p>
            <label style={{ fontSize: 14, fontWeight: 600 }}>What do you sell?</label>
            <textarea style={{ ...input, minHeight: 72, margin: "6px 0 12px" }} maxLength={160} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Hand-poured soy candles for gifts" />
            <label style={{ fontSize: 14, fontWeight: 600 }}>Products (optional, one per line, e.g. “Lavender candle - 18”)</label>
            <textarea style={{ ...input, minHeight: 120, margin: "6px 0 12px" }} value={products} onChange={(e) => setProducts(e.target.value)} placeholder={"Lavender candle - 18\nCedar candle - 20"} />
            <label style={{ fontSize: 14, fontWeight: 600 }}>Currency</label>
            <select style={{ ...input, margin: "6px 0 16px", maxWidth: 160 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {["EUR", "USD", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "ZAR", "NGN", "INR", "JPY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <div>
              <button onClick={build} disabled={busy || !niche.trim()} style={{ background: "#008060", color: "#fff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: busy || !niche.trim() ? "not-allowed" : "pointer", opacity: busy || !niche.trim() ? 0.6 : 1 }}>
                {busy ? "Building…" : "Build my store drafts"}
              </button>
            </div>
            {error && <p style={{ color: "#d72c0d", fontSize: 14 }}>{error}</p>}
          </div>

          {result && (
            <div style={card}>
              <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>
                Created {result.created.products} draft product{result.created.products === 1 ? "" : "s"} and {result.created.pages} unpublished page{result.created.pages === 1 ? "" : "s"}
              </h2>
              <p style={{ fontSize: 14, margin: "0 0 8px" }}>Review them in Shopify admin under Products and Online Store → Pages, then publish what you want.</p>
              {result.problems.length > 0 && (
                <ul style={{ fontSize: 13, color: "#8c6e00" }}>
                  {result.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              <h3 style={{ fontSize: 14, margin: "12px 0 4px" }}>Before you launch</h3>
              <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
                {result.checklist.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: "#5c5f62" }}>This is general information, not legal or tax advice.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
