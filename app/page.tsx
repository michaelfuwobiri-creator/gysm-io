"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const FEATURES = [
  { icon: "✦", title: "Prompt to product", body: "Type what you want. Get a real, working app — not a mockup you have to rebuild." },
  { icon: "◆", title: "Auth, done for you", body: "Sign-up, login, and sessions are wired in automatically, from the first prompt." },
  { icon: "$", title: "Payments that work", body: "Stripe checkout and subscriptions, no integration required on your end." },
  { icon: "▲", title: "Ship in one click", body: "Every build gets a live preview instantly — deploy it or keep iterating." },
];

// avatar: AI-generated headshot-style images (Canva/Firefly), picked by Mike
// after being told this crosses the FTC's endorsement-guideline line for
// fabricated testimonials (Sarah/Marcus/Priya/David/Alex are example quotes,
// not real customers) -- he opted to proceed anyway. Mike's own entry is a
// genuine testimonial from GYSM's real founder.

const TESTIMONIALS = [
  { name: "Sarah J.", role: "Weekend project, shipped", text: "Turned a weekend idea into a live product before Monday.", avatar: "https://design.canva.ai/zGfnpM4y1x8NGg5" },
  { name: "Marcus T.", role: "Solo founder", text: "Went from prompt to Stripe checkout in one sitting.", avatar: "https://design.canva.ai/-2-7jcSbQs0SqTu" },
  { name: "Priya K.", role: "Indie hacker", text: "Looks like a funded startup's product. It's just me and GYSM.", avatar: "https://design.canva.ai/ZxajrcvAhszPmNX" },
  { name: "David L.", role: "Agency owner", text: "Fastest I've ever gone from client idea to something they could click through.", avatar: "https://design.canva.ai/v669J_BfMKiNkKe" },
  { name: "Alex R.", role: "Product designer", text: "This is what I wanted every AI builder to be — it actually ships.", avatar: "https://design.canva.ai/s1gIvRx98_hQx1v" },
];

// Real, named apps built on GYSM. Each gets an original hand-drawn SVG mark
// (below) instead of a stock emoji, so the grid reads like an actual app
// showcase/portfolio rather than a placeholder tile set.
// Real apps published to BuildGuild by GYSM's own founder while testing the
// platform (verified live at /publish/[id] as of writing) -- swapped in for
// the earlier fictional placeholder tiles so this grid links to real,
// clickable builds instead of names nothing points to. Each `mark` recreates
// that app's actual generated logo (icon shape + color + wordmark), not a
// generic placeholder glyph.
const APPS = [
  { name: "orbit.", tag: "Live", projectId: "5b983815-8702-4bde-b4d6-712ae95d95c0", color: "from-fuchsia-500 to-violet-600", desc: "Zodiac dating app" },
  { name: "Studio Sol", tag: "Live", projectId: "2f736c3e-f255-4ec2-80f6-60dac7d3afd3", color: "from-pink-500 to-orange-500", desc: "Salon booking" },
  { name: "loop.", tag: "Live", projectId: "7ce589a2-76aa-4a38-98c4-a915423d347c", color: "from-indigo-500 to-purple-600", desc: "Habit tracker" },
  { name: "VelocityRun", tag: "Live", projectId: "01d17652-6489-42d2-bfdf-61e12810e285", color: "from-indigo-600 to-fuchsia-600", desc: "Racing game" },
];

// Recreates each real app's actual generated mark (icon shape + letter +
// wordmark), not a generic placeholder glyph -- verified against the live
// build at /publish/[projectId] for each entry in APPS.
function AppLogo({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "orbit.":
      return (
        <div className={`${className} rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-500 grid place-items-center`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
            <path d="M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6L12 4Z" fill="white" />
          </svg>
        </div>
      );
    case "Studio Sol":
      return (
        <div className={`${className} rounded-[10px] bg-gradient-to-br from-pink-500 to-orange-400 grid place-items-center text-white font-black`}>
          S
        </div>
      );
    case "loop.":
      return (
        <div className={`${className} rounded-[10px] bg-gradient-to-br from-indigo-500 to-purple-600 grid place-items-center text-white font-black`}>
          L
        </div>
      );
    case "VelocityRun":
      return (
        <div className={`${className} rounded-[10px] bg-gradient-to-br from-indigo-600 to-fuchsia-600 grid place-items-center text-white font-black`}>
          V
        </div>
      );
    default:
      return null;
  }
}

const FAQ = [
  { q: "Is GYSM.IO really no-code?", a: "Yes. You describe the app you want in plain English and GYSM.IO's AI writes and assembles the full-stack code for you -- pages, auth, database, and payments -- with zero manual coding required. If you're technical, you can still view and export the code to customize further." },
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
  // Clerk's useUser() can resolve isLoaded/isSignedIn before React's first
  // client render commits, which makes that first client render diverge
  // from the server-rendered HTML (server always renders "logged out").
  // Gating on `mounted` (only ever true after the initial commit, via
  // useEffect) keeps the first client render identical to the server
  // render, so hydration never mismatches -- the nav then swaps to the
  // signed-in state a tick later, same as any client-only UI.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
              "GYSM.IO is an AI no-code app builder. Describe an app in plain English and it builds a real, working full-stack website with auth, payments, and a live preview -- generated by AI in seconds, no coding required.",
            keywords: "no-code app builder, AI app builder, AI prompt to app, build full-stack web apps without code, no-code SaaS builder",
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
          <div className="flex items-center gap-2"><span className="font-black tracking-tighter text-[16px]">GYSM<span className="text-fuchsia-500">.IO</span></span></div>
          <div className="flex items-center gap-2">
            <a href="/buildguild" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">BuildGuild</a>
            <a href="/templates" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Templates</a>
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Pricing</a>
            {mounted && isLoaded && isSignedIn ? (
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
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">The AI no-code app builder for founders who ship</div>
        <h1 className="mt-6 mx-auto max-w-[820px] text-[40px] leading-[0.9] md:text-[84px] font-black tracking-[-0.05em]">
          Build apps<br />10x faster<br />than <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">coding</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[480px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">Describe the app you want. GYSM.IO's AI no-code app builder turns that prompt into a real, working full-stack app — auth, database, and Stripe payments included — without writing a line of code.</p>

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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[12px] font-semibold">
                      <span className="opacity-40">Popular:</span>
                      <a href="/build/dating-app" className="opacity-60 hover:opacity-100 underline underline-offset-4">Dating app</a>
                      <a href="/build/saas" className="opacity-60 hover:opacity-100 underline underline-offset-4">SaaS</a>
                      <a href="/build/booking-app" className="opacity-60 hover:opacity-100 underline underline-offset-4">Booking app</a>
          </div>
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
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {APPS.map((app) => (
            <a
              key={app.name}
              href={`/publish/${app.projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-[20px] bg-white border border-black/5 p-3 md:p-4 hover:shadow-lg transition"
            >
              <div className="h-[88px] md:h-[110px] rounded-[14px] bg-zinc-50 border border-black/5 grid place-items-center">
                <AppLogo name={app.name} className="h-11 w-11 md:h-14 md:w-14 text-[18px] md:text-[22px]" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold">{app.name}</div>
                  <div className="text-[11px] opacity-50 mt-0.5">{app.desc}</div>
                </div>
                <div className="text-[10px] font-bold px-2 py-1 rounded-full bg-black text-white shrink-0">{app.tag}</div>
              </div>
            </a>
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
          <div className="py-6 text-center text-[11px] text-black/30">© 2026 GYSM<span className="text-fuchsia-500">.IO</span> — built for founders who ship</div>
        </div>
      </section>
    </div>
  )
}
