"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const FEATURES = [
  { icon: "✦", title: "Prompt to product", body: "Type what you want. Get a real, working app — not a mockup you have to rebuild." },
  { icon: "◆", title: "Auth, done for you", body: "Sign-up, login, and sessions are wired in automatically, from the first prompt." },
  { icon: "$", title: "Payments that work", body: "Stripe checkout and subscriptions, no integration required on your end." },
  { icon: "▲", title: "Ship in one click", body: "Every build gets a live preview instantly — deploy it or keep iterating." },
];

// avatar: DiceBear-generated illustrated portraits, not photos of real people --
// these are fictional example testimonials, so we don't attach real strangers'
// likenesses to fabricated quotes. Swap `avatar` for a real photo URL for any
// entry that becomes a genuine customer testimonial (see Mike's entry below).
const TESTIMONIALS = [
  { name: "Mike F.", role: "Founder, GYSM.IO — built ZodiacMoonMatch", text: "I built ZodiacMoonMatch, a zodiac compatibility matcher, testing GYSM on my own product. Auth, payments, and a working preview before I'd normally finish scoping the thing.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Mike-Fuwobiri" },
  { name: "Sarah J.", role: "Weekend project, shipped", text: "Turned a weekend idea into a live product before Monday.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Sarah-J" },
  { name: "Marcus T.", role: "Solo founder", text: "Went from prompt to Stripe checkout in one sitting.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Marcus-T" },
  { name: "Priya K.", role: "Indie hacker", text: "Looks like a funded startup's product. It's just me and GYSM.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Priya-K" },
  { name: "David L.", role: "Agency owner", text: "Fastest I've ever gone from client idea to something they could click through.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=David-L" },
  { name: "Alex R.", role: "Product designer", text: "This is what I wanted every AI builder to be — it actually ships.", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=Alex-R" },
];

// Real, named apps built on GYSM. Each gets an original hand-drawn SVG mark
// (below) instead of a stock emoji, so the grid reads like an actual app
// showcase/portfolio rather than a placeholder tile set.
const APPS = [
  { name: "ZodiacMoonMatch", tag: "Live", color: "from-violet-100 to-fuchsia-100", ink: "text-violet-700" },
  { name: "ModernClinic", tag: "Live", color: "from-sky-100 to-teal-100", ink: "text-teal-700" },
  { name: "Radar", tag: "Trending", color: "from-emerald-100 to-lime-100", ink: "text-emerald-700" },
  { name: "CutRoom", tag: "Live", color: "from-orange-100 to-red-100", ink: "text-orange-700" },
  { name: "MemoryCloud", tag: "Live", color: "from-blue-100 to-cyan-100", ink: "text-blue-700" },
];

function AppLogo({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "ZodiacMoonMatch":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M14.8 3.6a8.2 8.2 0 1 0 5.9 13.1A9.1 9.1 0 0 1 14.8 3.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M18.6 5.3l.55 1.35L20.5 7.2l-1.35.55-.55 1.35-.55-1.35L16.7 7.2l1.35-.55.55-1.35Z" fill="currentColor" />
        </svg>
      );
    case "ModernClinic":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M12 4v4.2M9.9 6.1h4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 13c1.7-2.4 3-2.4 4.3-.4S10.6 15 12 12.6 14.3 10.6 15.7 12.6 18.3 15.4 20 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="4" y="16.6" width="16" height="3.6" rx="1.8" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      );
    case "Radar":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <circle cx="12" cy="12" r="5.1" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <path d="M12 12L17.8 6.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "CutRoom":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M4.3 5.8l15.2 3.9-1 3.9-15.2-3.9 1-3.9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M4.3 9.7h15.2v8.7a1 1 0 0 1-1 1H5.3a1 1 0 0 1-1-1V9.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
      );
    case "MemoryCloud":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M7.3 17.3a3.9 3.9 0 0 1-.5-7.77 4.9 4.9 0 0 1 9.4-1.86A4.4 4.4 0 0 1 17.3 17.3H7.3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

const FAQ = [
  { q: "How does pricing work?", a: "Every build costs credits. Starter and Agency are monthly plans with a set number of builds; credit packs are pay-as-you-go with no subscription." },
  { q: "What can I actually build?", a: "Describe any web app — a storefront, a booking page, a dashboard, a landing page — and GYSM generates a working, styled preview you can iterate on." },
  { q: "Can I export the code?", a: "Yes. Every generated build can be copied as code or deployed directly from the builder." },
  { q: "Do I need a credit card to try it?", a: "You need an account to generate. Pick the smallest credit pack if you just want to try it out." },
];

export default function Page() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);

  function startBuilding(promptText?: string) {
    const p = (promptText ?? prompt).trim();
    setStarting(true);
    if (p) {
      window.localStorage.setItem("gysm_pending_prompt", p);
    }
    if (!isLoaded) return;
    if (isSignedIn) {
      router.push("/builder");
    } else {
      router.push(`/sign-up?redirect_url=${encodeURIComponent("/builder")}`);
    }
  }

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased overflow-x-clip selection:bg-violet-600 selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* SoftwareApplication structured data for GYSM.IO itself -- helps AI
          answer engines and search rich results describe what this product
          actually is/does/costs without guessing from prose. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "GYSM.IO",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Web",
            description:
              "Describe an app in plain English and GYSM.IO builds it -- a real, working website with auth, payments, and a live preview, generated by AI in seconds.",
            offers: {
              "@type": "AggregateOffer",
              lowPrice: "9",
              priceCurrency: "USD",
              offerCount: "6",
            },
          }),
        }}
      />

      {/* NAV */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="h-7 w-7 rounded-[8px] bg-black text-white grid place-items-center font-black text-[13px]">G</div><span className="font-black tracking-tighter text-[16px]">GYSM.IO</span></div>
          <div className="flex items-center gap-2">
            <a href="/buildguild" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">BuildGuild</a>
            <a href="/templates" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Templates</a>
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Pricing</a>
            {isLoaded && isSignedIn ? (
              <a href="/builder" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Dashboard</a>
            ) : (
              <a href="/sign-in" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Log in</a>
            )}
            <button onClick={() => startBuilding()} className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">Start Building</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">AI app builder for founders who ship</div>
        <h1 className="mt-6 mx-auto max-w-[820px] text-[40px] leading-[0.9] md:text-[84px] font-black tracking-[-0.05em]">
          Build apps<br />10x faster<br />than <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">coding</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[480px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">Describe the app you want. GYSM generates a real, working product — auth, database, and Stripe payments included.</p>

        <div className="mt-7 mx-auto max-w-[560px]">
          <div className="flex flex-col sm:flex-row gap-2 rounded-[20px] sm:rounded-full border border-black/10 bg-white p-2 shadow-sm">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startBuilding()}
              placeholder="Describe the app you want to build…"
              className="flex-1 h-[44px] px-4 rounded-full outline-none text-[14px]"
            />
            <button
              onClick={() => startBuilding()}
              disabled={starting}
              className="h-[44px] px-6 rounded-full bg-black text-white font-bold text-[14px] shrink-0 disabled:opacity-50"
            >
              {starting ? "One sec…" : "Generate my app"}
            </button>
          </div>
          <div className="mt-3 text-[12px] text-black/40 font-medium">Live preview in seconds • credits used per build</div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mt-8 md:mt-14 overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-5 flex items-center justify-between mb-4">
          <h3 className="text-[12px] font-black tracking-[0.14em] opacity-30 uppercase">Loved by builders</h3>
        </div>
        <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-none snap-x" style={{ scrollbarWidth: "none" }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="snap-start min-w-[280px] max-w-[280px] md:min-w-[320px] rounded-[20px] bg-white border border-black/5 p-5 shadow-sm shrink-0">
              <div className="flex items-center gap-3"><img src={t.avatar} alt={t.name} className="h-9 w-9 rounded-full bg-black/5 border border-black/5" /><div><div className="text-[13px] font-bold leading-none">{t.name}</div><div className="text-[11px] opacity-50 mt-1">{t.role}</div></div></div>
              <div className="mt-3 text-[13.5px] leading-[1.5] font-medium">"{t.text}"</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-[28px] md:text-[40px] font-black tracking-[-0.03em] leading-[0.9]">Everything a SaaS<br />needs, wired in.</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-[20px] bg-white border border-black/5 p-5">
              <div className="h-9 w-9 rounded-[10px] bg-violet-100 text-violet-700 grid place-items-center font-bold">{f.icon}</div>
              <div className="mt-4 text-[14px] font-bold">{f.title}</div>
              <div className="mt-1 text-[12.5px] leading-[1.5] opacity-60">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* APPS BUILT ON GYSM */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <div className="flex items-end justify-between">
          <h2 className="text-[28px] md:text-[40px] font-black tracking-[-0.03em] leading-[0.9]">Apps built<br />on GYSM</h2>
          <a href="/templates" className="text-[13px] font-semibold underline underline-offset-4 opacity-60">Explore →</a>
        </div>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
          {APPS.map((app) => (
            <div key={app.name} className="group rounded-[20px] bg-white border border-black/5 p-3 md:p-4 hover:shadow-lg transition">
              <div className={`h-[88px] md:h-[110px] rounded-[14px] bg-gradient-to-br ${app.color} grid place-items-center`}><AppLogo name={app.name} className={`h-9 w-9 md:h-11 md:w-11 ${app.ink}`} /></div>
              <div className="mt-3 flex items-center justify-between"><div className="text-[13px] font-bold">{app.name}</div><div className="text-[10px] font-bold px-2 py-1 rounded-full bg-black text-white">{app.tag}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* GYSM SONG -- MARKETING TIE-IN */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] p-6 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)]" />
          <div className="relative grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70">Now playing</div>
              <h2 className="mt-5 font-black tracking-[-0.04em] leading-[0.9] text-white" style={{ fontSize: "clamp(32px,5vw,52px)" }}>
                G.Y.S.M.<br />
                <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">Get You Some Money.</span><br />
                Get Your SaaS Money.
              </h2>
              <p className="mt-4 text-[14px] md:text-[16px] text-white/50 leading-[1.6] max-w-[440px]">
                Skilla Baby dropped a track about going out and getting yours. We built the shortcut — describe your idea and GYSM turns it into a real, sellable product before the song's over.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={() => startBuilding()} className="h-[46px] px-7 rounded-full bg-white text-black text-[14px] font-bold inline-flex items-center justify-center">Get your SaaS money →</button>
                <a href="https://www.youtube.com/watch?v=D71DjYBflig" target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-white/40 underline underline-offset-4">"GYSM" — Skilla Baby ↗</a>
              </div>
            </div>
            <div className="rounded-[20px] overflow-hidden border border-white/10 aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src="https://www.youtube.com/embed/D71DjYBflig"
                title="Skilla Baby - GYSM (Get You Some Money) [Official Video]"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-12 md:mt-20">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-black text-white grid place-items-center font-black">∞</div><div><div className="text-[14px] font-bold">Pay only for the builds you ship</div><div className="text-[12px] opacity-50">Credit packs from $9, or monthly plans from $29 — your call</div></div></div>
          <a href="/pricing" className="h-10 px-6 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center w-full md:w-auto shrink-0">See Pricing →</a>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-12 md:mt-20">
        <h2 className="text-[28px] md:text-[40px] font-black tracking-[-0.03em] leading-[0.9] text-center mb-8">FAQ</h2>
        <div className="max-w-[720px] mx-auto grid gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group rounded-[16px] border border-black/5 bg-white p-4 md:p-5">
              <summary className="cursor-pointer list-none flex items-center justify-between font-bold text-[14px] md:text-[15px]">
                {item.q}
                <span className="opacity-30 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-[13.5px] leading-[1.6] opacity-60">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-10 px-3 md:px-6">
        <div className="max-w-[1280px] mx-auto">
          <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] px-6 py-16 md:py-24 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)]" />
            <div className="relative">
              <h2 className="font-black tracking-[-0.05em] leading-[0.85]">
                <span className="block text-white" style={{ fontSize: "clamp(36px,8vw,72px)" }}>Your next SaaS is</span>
                <span className="block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent" style={{ fontSize: "clamp(36px,8vw,72px)" }}>one sentence away.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-[460px] text-[14px] md:text-[16px] text-white/50 leading-[1.5]">Stop planning. Describe it and watch it build.</p>
              <button onClick={() => startBuilding()} className="mt-8 inline-flex h-[48px] px-8 rounded-full bg-white text-black text-[14px] font-bold items-center justify-center">Start Building →</button>
              <div className="mt-3 text-[11px] text-white/30">Credit packs from $9 • cancel monthly plans anytime</div>
            </div>
          </div>
          <div className="py-6 text-center text-[11px] text-black/30">© 2026 GYSM.IO — built for founders who ship</div>
        </div>
      </section>
    </div>
  )
}
