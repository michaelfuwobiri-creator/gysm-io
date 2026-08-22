"use client";

import { useMemo, useState } from "react";

type Domain = {
  name: string;
  tags: string[];
  price: number;
  blurb: string;
};

const DOMAINS: Domain[] = [
  { name: "soulmatch.io", tags: ["Dating", "Social"], price: 4800, blurb: "Two clean words, obvious meaning -- built for a matchmaking or relationship app." },
  { name: "vybe.io", tags: ["Brandable", "Lifestyle"], price: 6200, blurb: "Short, phonetic, and instantly readable -- fits music, events, or social." },
  { name: "paird.io", tags: ["Brandable", "Dating"], price: 3900, blurb: "A playful misspelling that still reads clean -- pairing, matching, marketplaces." },
  { name: "loopwave.io", tags: ["SaaS", "Tech"], price: 3200, blurb: "Two-word compound with rhythm -- reads like a real product, not a placeholder." },
  { name: "driftly.io", tags: ["Brandable", "SaaS"], price: 2800, blurb: "The '-ly' pattern startups love, still unclaimed on .io." },
  { name: "coreflux.io", tags: ["Tech", "Infra"], price: 5400, blurb: "Sounds engineered -- strong fit for a dev tool, infra, or platform brand." },
  { name: "nestly.io", tags: ["Brandable", "Home"], price: 3100, blurb: "Warm, short, and available across most social handles too." },
  { name: "ember.io", tags: ["Brandable", "Consumer"], price: 8900, blurb: "One word, evocative, zero explanation needed. Rare at this length." },
  { name: "gridlane.io", tags: ["Tech", "Logistics"], price: 4100, blurb: "Structured and confident -- reads well for mapping, logistics, or infra." },
  { name: "havenly.io", tags: ["Brandable", "Home"], price: 2600, blurb: "Soft, trustworthy tone -- suits wellness, real estate, or community apps." },
  { name: "pulsedeck.io", tags: ["SaaS", "Analytics"], price: 3700, blurb: "Sounds like a dashboard product on day one -- analytics, monitoring, ops." },
  { name: "quirkly.io", tags: ["Brandable", "Consumer"], price: 2400, blurb: "Distinctive and memorable -- good fit for a quirky consumer brand." },
  { name: "fablehouse.io", tags: ["Brandable", "Media"], price: 3300, blurb: "Storytelling built into the name -- content, media, or creative studios." },
  { name: "northbeam.io", tags: ["Brandable", "B2B"], price: 5900, blurb: "Reads established and trustworthy -- strong for a B2B or fintech brand." },
  { name: "verselane.io", tags: ["Brandable", "Media"], price: 2900, blurb: "Distinctive two-word combo, still fully available across major platforms." },
];

const ALL_TAGS = Array.from(new Set(DOMAINS.flatMap((d) => d.tags))).sort();

function formatPrice(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}

export default function MarketplaceClient() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [interestDomain, setInterestDomain] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return DOMAINS.filter((d) => {
      const matchesQuery = query.trim().length === 0 || d.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesTag = !activeTag || d.tags.includes(activeTag);
      return matchesQuery && matchesTag;
    });
  }, [query, activeTag]);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/marketplace/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, domain: interestDomain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="marketplace-root">
      <style
        // dangerouslySetInnerHTML, not JSX children -- this is the actual
        // root cause of /marketplace's #418/#423/#425 hydration errors.
        // React HTML-escapes plain text children uniformly, so the quoted
        // font names below (font-family: 'Inter', 'Instrument Serif') got
        // rendered server-side as font-family: &#x27;Inter&#x27;, ... . But
        // <style> is a "raw text" element per the HTML spec -- browsers do
        // NOT decode entities inside <style>/<script>, so the DOM's actual
        // text content after the browser parses that HTML is the literal,
        // still-escaped string. On hydration, React re-renders this exact
        // JSX fresh on the client, computes the *unescaped* string (a real
        // apostrophe), compares it to that already-escaped DOM text content,
        // finds a mismatch, and throws. Exact same underlying mechanism as
        // the Google Fonts @import bug fixed earlier (HTML-escaping vs. a
        // context that never decodes it) -- different content, same root
        // cause. dangerouslySetInnerHTML sets raw text with zero escaping,
        // matching what the browser stores, so there's nothing left to
        // mismatch.
        dangerouslySetInnerHTML={{
          __html: `
        .marketplace-root {
          --cream: #fffbf0;
          --ink: #16130f;
          --line: rgba(22,19,15,0.12);
          background: var(--cream);
          color: var(--ink);
          min-height: 100vh;
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        }
        .mp-serif { font-family: 'Instrument Serif', Georgia, serif; }
        .mp-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 22px 32px; border-bottom: 1px solid var(--line);
          position: sticky; top: 0; background: var(--cream); z-index: 10;
        }
        .mp-badge {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
          border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px;
          color: rgba(22,19,15,0.65);
        }
        .mp-dot { width: 6px; height: 6px; border-radius: 999px; background: #d4622a; }
        .mp-hero { padding: 64px 32px 40px; text-align: center; max-width: 760px; margin: 0 auto; }
        .mp-hero h1 { font-size: clamp(40px, 6vw, 68px); line-height: 1.02; margin: 22px 0 16px; }
        .mp-hero p { font-size: 17px; color: rgba(22,19,15,0.68); max-width: 560px; margin: 0 auto; }
        .mp-search-row {
          display: flex; gap: 10px; max-width: 520px; margin: 32px auto 0;
          flex-wrap: wrap; justify-content: center;
        }
        .mp-input {
          flex: 1; min-width: 220px; padding: 12px 16px; border-radius: 10px;
          border: 1px solid var(--line); background: white; font-size: 14px;
          color: var(--ink);
        }
        .mp-input:focus { outline: 2px solid #d4622a33; }
        .mp-tags { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin: 24px auto 0; max-width: 640px; }
        .mp-tag {
          font-size: 12.5px; padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line);
          background: white; cursor: pointer; color: rgba(22,19,15,0.72);
        }
        .mp-tag.active { background: var(--ink); color: var(--cream); border-color: var(--ink); }
        .mp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px; padding: 40px 32px 24px; max-width: 1180px; margin: 0 auto;
        }
        .mp-card {
          border: 1px solid var(--line); border-radius: 16px; background: white;
          padding: 22px; display: flex; flex-direction: column; gap: 12px;
        }
        .mp-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .mp-card-name { font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
        .mp-card-price { font-size: 13px; color: rgba(22,19,15,0.55); white-space: nowrap; }
        .mp-card-blurb { font-size: 13.5px; color: rgba(22,19,15,0.65); line-height: 1.5; flex: 1; }
        .mp-card-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .mp-chip { font-size: 11px; padding: 4px 9px; border-radius: 999px; background: #f4efe1; color: rgba(22,19,15,0.65); }
        .mp-card-cta {
          margin-top: 4px; text-align: center; padding: 10px; border-radius: 10px;
          border: 1px dashed var(--line); font-size: 12.5px; letter-spacing: 0.03em;
          text-transform: uppercase; color: rgba(22,19,15,0.55); cursor: pointer;
          background: #faf6ea; transition: background 0.15s;
        }
        .mp-card-cta:hover { background: #f4ecd8; }
        .mp-empty { text-align: center; color: rgba(22,19,15,0.5); padding: 60px 20px; grid-column: 1 / -1; }
        .mp-cta-section {
          max-width: 640px; margin: 24px auto 80px; padding: 40px 32px; text-align: center;
          border-top: 1px solid var(--line);
        }
        .mp-cta-section h2 { font-size: 32px; margin: 0 0 10px; }
        .mp-cta-section p { color: rgba(22,19,15,0.65); font-size: 14.5px; margin-bottom: 22px; }
        .mp-form-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .mp-btn {
          padding: 12px 22px; border-radius: 10px; border: none; background: var(--ink);
          color: var(--cream); font-size: 14px; font-weight: 500; cursor: pointer;
        }
        .mp-btn:disabled { opacity: 0.6; cursor: default; }
        .mp-note { font-size: 12.5px; color: rgba(22,19,15,0.5); margin-top: 12px; }
        .mp-status-ok { color: #2d7a4d; font-size: 13.5px; margin-top: 14px; }
        .mp-status-err { color: #b8452f; font-size: 13.5px; margin-top: 14px; }
        .mp-footer {
          border-top: 1px solid var(--line); padding: 22px 32px; text-align: center;
          font-size: 12.5px; color: rgba(22,19,15,0.45);
        }
      `,
        }}
      />

      <header className="mp-header">
        <span className="mp-serif" style={{ fontSize: 20 }}>GYSM Marketplace</span>
        <a href="/" style={{ fontSize: 13, color: "rgba(22,19,15,0.6)", textDecoration: "none" }}>← Back to GYSM.IO</a>
      </header>

      <section className="mp-hero">
        <span className="mp-badge"><span className="mp-dot" /> Coming Soon</span>
        <h1 className="mp-serif">A curated marketplace for great .io domains.</h1>
        <p>
          GYSM Marketplace is a hand-picked collection of short, brandable .io names --
          the kind you'd want to build your next app on. Browsing is open now; buying
          isn't yet. Join the waitlist and we'll email you the moment it launches.
        </p>

        <div className="mp-search-row">
          <input
            className="mp-input"
            placeholder="Search domains..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mp-tags">
          <button className={`mp-tag ${!activeTag ? "active" : ""}`} onClick={() => setActiveTag(null)}>
            All
          </button>
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              className={`mp-tag ${activeTag === tag ? "active" : ""}`}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      <div className="mp-grid">
        {filtered.length === 0 && <div className="mp-empty">No domains match that search.</div>}
        {filtered.map((d) => (
          <div className="mp-card" key={d.name}>
            <div className="mp-card-top">
              <span className="mp-card-name">{d.name}</span>
              <span className="mp-card-price">{formatPrice(d.price)}</span>
            </div>
            <p className="mp-card-blurb">{d.blurb}</p>
            <div className="mp-card-tags">
              {d.tags.map((t) => (
                <span className="mp-chip" key={t}>{t}</span>
              ))}
            </div>
            <div
              className="mp-card-cta"
              onClick={() => {
                setInterestDomain(d.name);
                document.getElementById("mp-waitlist-email")?.scrollIntoView({ behavior: "smooth", block: "center" });
                (document.getElementById("mp-waitlist-email") as HTMLInputElement | null)?.focus();
              }}
            >
              Coming soon -- notify me
            </div>
          </div>
        ))}
      </div>

      <section className="mp-cta-section">
        <h2 className="mp-serif">Get notified at launch</h2>
        <p>
          {interestDomain
            ? `We'll let you know the moment ${interestDomain} (and the rest of the marketplace) is ready to buy.`
            : "Leave your email and we'll reach out the moment domains go live for purchase."}
        </p>
        <form className="mp-form-row" onSubmit={joinWaitlist}>
          <input
            id="mp-waitlist-email"
            className="mp-input"
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <button className="mp-btn" type="submit" disabled={status === "loading" || status === "done"}>
            {status === "done" ? "You're on the list" : status === "loading" ? "Joining..." : "Notify me"}
          </button>
        </form>
        {status === "done" && <p className="mp-status-ok">Thanks -- we'll email you when the marketplace opens.</p>}
        {status === "error" && <p className="mp-status-err">{errorMsg}</p>}
        <p className="mp-note">No purchases happen today. This just adds you to the launch list.</p>
      </section>

      <footer className="mp-footer">GYSM Marketplace is a preview from the team behind GYSM.IO. Not yet open for purchases.</footer>
    </div>
  );
}
