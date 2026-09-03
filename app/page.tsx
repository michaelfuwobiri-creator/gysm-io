"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import CookiePreferencesLink from "./components/CookiePreferencesLink";

const NavAuthLink = dynamic(() => import("./components/NavAuthLink"), { ssr: false });

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

// Every mark below is a purpose-drawn glyph tied to what that app actually
// does (a burst for orbit's zodiac matching, a sun for Studio Sol's salon
// bookings, a repeat cycle for loop's habit tracking, a speed chevron for
// VelocityRun's racing game) -- not an initial in a box. Same rounded-app-icon
// shape across all four so the row reads as a real home-screen icon grid,
// something you'd actually tap, rather than a plain lettered tile set.
function AppLogo({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "orbit.":
      return (
        <div className={`${className} rounded-[18px] bg-gradient-to-br from-fuchsia-400 to-violet-500 grid place-items-center shadow-inner`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
            <path d="M12 4l1.6 5.4L19 11l-5.4 1.6L12 18l-1.6-5.4L5 11l5.4-1.6L12 4Z" fill="white" />
          </svg>
        </div>
      );
    case "Studio Sol":
      return (
        <div className={`${className} rounded-[18px] bg-gradient-to-br from-pink-500 to-orange-400 grid place-items-center shadow-inner`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
            <circle cx="12" cy="12" r="4" fill="white" />
            <g stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2.5v3M12 18.5v3M3.8 3.8l2.1 2.1M18.1 18.1l2.1 2.1M2.5 12h3M18.5 12h3M3.8 20.2l2.1-2.1M18.1 5.9l2.1-2.1" />
            </g>
          </svg>
        </div>
      );
    case "loop.":
      return (
        <div className={`${className} rounded-[18px] bg-gradient-to-br from-indigo-500 to-purple-600 grid place-items-center shadow-inner`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
            <path d="M4 12a8 8 0 0 1 8-8c2.5 0 4.7 1.2 6.1 3M20 4v4h-4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M20 12a8 8 0 0 1-8 8c-2.5 0-4.7-1.2-6.1-3M4 20v-4h4" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    case "VelocityRun":
      return (
        <div className={`${className} rounded-[18px] bg-gradient-to-br from-indigo-600 to-fuchsia-600 grid place-items-center shadow-inner`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-[55%] w-[55%]">
            <path d="M2.5 7.5h9M2.5 12h13M2.5 16.5h6" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M14.5 5.5l6.5 6.5-6.5 6.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

// Experiential storytelling cards -- founders / shippers / agencies / indie
// hackers. Photography intentionally NOT hotlinked from a third party here:
// each `art` slot is a brand-colored gradient placeholder sized exactly like
// the final photo will be (rounded-[20px], h-[400px] on desktop, object-cover
// aspect). Drop a real, licensed <img src="..." className="h-full w-full
// object-cover" /> into that div in place of the placeholder <span> once
// photography is ready -- everything else (overlap, shadow, copy) is final.
const STORY_CARDS = [
  { align: "left" as const, gradient: "from-amber-200 via-orange-300 to-rose-300", title: "for the founders.", sub: "prompt to product // auth, database, payments, live preview", placeholder: "Founder photo -- drop in real photography here", image: "/media/story-founders.jpg" },
  { align: "right" as const, gradient: "from-sky-400 via-blue-500 to-indigo-600", title: "for the shippers.", sub: "ship in one click // idea to production", placeholder: "Launch / motion photo -- drop in real photography here", image: "/media/story-shippers.jpg" },
  { align: "left" as const, gradient: "from-slate-300 via-slate-400 to-slate-600", title: "for the agencies.", sub: "client portals // white-label SaaS factory", placeholder: "Skyline / architecture photo -- drop in real photography here", image: "/media/story-agencies.jpg" },
  { align: "right" as const, gradient: "from-fuchsia-500 via-violet-600 to-indigo-700", title: "for the indie hackers.", sub: "solo builder // ship it yourself", placeholder: "Studio / tech photo -- drop in real photography here", image: null },
];

const INDEX_SECTIONS = [
  { id: "hero", label: "Home" },
  { id: "highlights", label: "Highlights" },
  { id: "quote", label: "Ship" },
] as const;

export default function Page() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState<string>("hero");

  const heroRef = useRef<HTMLElement | null>(null);
  const highlightsRef = useRef<HTMLElement | null>(null);
  const quoteRef = useRef<HTMLElement | null>(null);
  const appsRef = useRef<HTMLElement | null>(null);

  // Real parallax: hero/quote backgrounds drift with scroll position and the
  // right-edge index nav highlights whichever section is actually in view.
  // (Squarespace's own site would do this via its proprietary
  // data-parallax-host / Index-nav JS controllers -- those don't exist
  // outside Squarespace's runtime, so this reimplements the same effect
  // with a plain scroll listener + IntersectionObserver instead.)
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const targets: [string, HTMLElement | null][] = [
      ["hero", heroRef.current],
      ["highlights", highlightsRef.current],
      ["quote", quoteRef.current],
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = targets.find(([, el]) => el === entry.target);
          if (match) setActiveSection(match[0]);
        });
      },
      { threshold: 0.5 }
    );
    targets.forEach(([, el]) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // No useUser() call in this component at all -- see NavAuthLink.tsx for
  // why. For this click handler (only ever invoked post-hydration, by a
  // real user click) we read Clerk's own global object imperatively
  // instead of a hook, which needs no render participation and therefore
  // can't diverge between server and client: window.Clerk is the same
  // documented singleton @clerk/nextjs's hooks read from internally.
  function startBuilding(promptText?: string) {
    const p = (promptText ?? prompt).trim();
    setStarting(true);
    if (p) {
      window.localStorage.setItem("gysm_pending_prompt", p);
    }
    const clerk = (window as any).Clerk;
    if (!clerk?.loaded) return;
    if (clerk.user) {
      router.push("/builder");
    } else {
      router.push(`/sign-up?redirect_url=${encodeURIComponent("/builder")}`);
    }
  }

  function scrollToId(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  const heroParallax = Math.min(scrollY * 0.25, 260);
  const heroFade = Math.max(1 - scrollY / 700, 0);

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased overflow-x-clip selection:bg-[#FF0080] selection:text-white">
      {/* A <link> tag, not an inline <style>@import> -- React HTML-escapes
          text content (the apostrophes here become &#x27;), and CSS's
          @import doesn't decode HTML entities, so the old <style> version
          was literally fetching a broken URL (".../&#x27;https://fonts...")
          and silently falling back to system fonts on every load. A
          link's href attribute is properly entity-decoded by the HTML
          parser, so this actually loads Inter. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      {/* SoftwareApplication structured data for GYSM.IO itself -- helps AI
          answer engines and search rich results describe what this product
          actually is/does/costs without guessing from prose. Site-wide
          Organization JSON-LD already lives in app/layout.tsx. */}
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
          <div className="flex items-center gap-2"><span className="font-black tracking-tighter text-[16px]">GYSM<span className="text-[#FF0080]">.IO</span></span></div>
          <div className="flex items-center gap-2">
            <a href="/buildguild" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">BuildGuild</a>
            <a href="/templates" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Templates</a>
            <a href="/connectors" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Connectors</a>
            <a href="/marketplace" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Marketplace</a>
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Pricing</a>
            <NavAuthLink />
            <button onClick={() => startBuilding()} className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">Start Building</button>
          </div>
        </div>
      </nav>

      {/* INDEX NAV -- right-edge vertical dots, desktop only, highlights the
          section currently in view via the IntersectionObserver above. */}
      <div className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-4 md:flex">
        {INDEX_SECTIONS.map((item) => (
          <button key={item.id} onClick={() => scrollToId(item.id)} className="group flex items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] transition ${activeSection === item.id ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`}>
              {item.label}
            </span>
            <span className={`h-2 w-2 rounded-full transition ${activeSection === item.id ? "bg-[#FF0080] scale-125" : "bg-black/20"}`} />
          </button>
        ))}
      </div>

      {/* HOME BANNER -- fullscreen hero with scroll-driven parallax.
          Background is Mike's own licensed YouTube video (confirmed his to
          use), embedded as a cover-fit iframe -- the 177.77vh/56.25vw sizing
          is the standard "YouTube as background video" cover hack: it keeps
          the embed's 16:9 frame always larger than the viewport on both axes
          so there's never letterboxing, however wide/tall the screen is.
          controls=0 hides YouTube's UI, mute=1 satisfies browser autoplay
          policy, loop=1 + playlist=<same id> makes a single video loop
          (YouTube's loop param needs a playlist to loop just one video). */}
      <section ref={heroRef as any} id="hero" className="relative flex min-h-[100vh] items-center justify-center overflow-hidden bg-[#0A0A0A] text-center">
        <div className="absolute inset-0" style={{ transform: `translateY(${heroParallax}px) scale(1.1)` }}>
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2"
              src="https://www.youtube.com/embed/BlKZqhrXv2g?autoplay=1&mute=1&loop=1&playlist=BlKZqhrXv2g&controls=0&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&showinfo=0"
              title="GYSM.IO background video"
              frameBorder={0}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              tabIndex={-1}
            />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(255,0,128,0.28),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(80%_80%_at_80%_100%,rgba(124,58,237,0.24),transparent_60%)]" />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        <div className="relative z-10 px-5" style={{ opacity: heroFade, transform: `translateY(${-heroParallax * 0.4}px)` }}>
          <h1 className="mx-auto max-w-[900px] whitespace-pre-wrap text-[40px] md:text-[84px] font-black leading-[0.9] tracking-[-0.05em] text-white">
            WE ARE <span className="bg-gradient-to-r from-[#FF0080] to-[#FF0080] bg-clip-text text-transparent">BUILDERS</span>,{" "}
            <span className="block md:inline">NOT DREAMERS</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] md:text-[18px] leading-[1.5] font-medium text-white/60">
            <span className="mb-1 block text-[12px] italic text-white/40">[you could be the next web mogul]</span>
            AI no-code factory. Prompt → product. Auth, database, payments, live preview — ship.
          </p>

          <div className="mx-auto mt-7 max-w-[560px]">
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
            <div className="mt-3 text-[12px] text-white/40 font-medium">Live preview in seconds • credits used per build</div>
          </div>
        </div>

        <button
          onClick={() => scrollToId("highlights")}
          className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-white/60 transition hover:text-white"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Scroll</span>
          <svg viewBox="0 0 48 23" className="h-[14px] w-[28px] animate-bounce" fill="none">
            <path d="M2 2l22 18L46 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* HIGHLIGHTS */}
      <section ref={highlightsRef as any} id="highlights" className="bg-[#FCFCF9] py-20 px-5 md:px-8">
        <div className="mx-auto max-w-[1280px]">
          <div className="mb-8 flex justify-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-fuchsia-400 to-violet-500 p-[1px] shadow-inner">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#FCFCF9]">
                <span className="text-[16px] font-black tracking-[-0.03em]">GYSM</span>
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-[560px] text-center">
            <h3 className="mb-4 text-[12px] font-black uppercase tracking-[0.14em] opacity-30">We take your idea and</h3>
            <h2 className="text-[28px] md:text-[52px] font-black leading-[0.9] tracking-[-0.03em]">Give it life.</h2>
            <p className="mx-auto mt-4 max-w-[560px] text-[14px] md:text-[16px] leading-[1.6] opacity-60">
              Est. 2024 — GYSM.IO is an AI no-code app builder. From prompt to product: auth, database, and Stripe payments included, without writing a line of code.
            </p>
            <button onClick={() => scrollToId("apps")} className="mt-8 inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-6 text-[13px] font-medium tracking-[-0.01em] shadow-sm transition hover:border-black/20 hover:shadow">
              See what's been built →
            </button>
          </div>

          {/* 4 overlapping story cards. Founders + agencies now use Mike's
              own supplied photos; shippers + indie hackers still fall back to
              the gradient placeholder until those two are sent over. */}
          <div className="relative mt-20">
            <div className="space-y-7 md:space-y-[-84px]">
              {STORY_CARDS.map((card, i) => (
                <div
                  key={card.title}
                  className={`group relative w-full md:w-[76%] ${card.align === "left" ? "md:mr-auto" : "md:ml-auto"}`}
                  style={{ zIndex: 10 + i }}
                >
                  <div className={`relative h-[280px] md:h-[400px] w-full overflow-hidden rounded-[20px] ${card.image ? "" : `bg-gradient-to-br ${card.gradient}`} grid place-items-center transition duration-500 group-hover:scale-[1.01]`}>
                    {card.image ? (
                      <img src={card.image} alt={card.title} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" />
                    ) : (
                      <span className="px-8 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-black/40">{card.placeholder}</span>
                    )}
                  </div>
                  <div className={`relative -mt-16 max-w-[320px] rounded-[20px] border border-black/5 bg-white p-6 shadow-lg ${card.align === "left" ? "ml-8" : "ml-auto mr-8"}`}>
                    <div className="text-[20px] font-bold leading-[1.1]">{card.title}</div>
                    <div className="mt-2 text-[12px] leading-[1.5] opacity-60">{card.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOME QUOTE -- dark parallax spotlight, placeholder gradient in place
          of a licensed background photo (see STORY_CARDS comment above). */}
      <section ref={quoteRef as any} id="quote" className="relative mt-8 overflow-hidden">
        <div className="relative flex min-h-[60vh] md:min-h-[72vh] items-center justify-center bg-[#0A0A0A]">
          <div className="absolute inset-0" style={{ transform: `translateY(${Math.max(Math.min((scrollY - 900) * 0.12, 80), -20)}px)` }}>
            <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(255,0,128,0.25),transparent_65%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_20%_80%,rgba(124,58,237,0.25),transparent_65%)]" />
          </div>
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative z-10 px-6 text-center">
            <h2 className="mx-auto max-w-[680px] text-[32px] md:text-[52px] font-black leading-[0.95] tracking-[-0.04em] text-white">
              Let's ship some apps<span className="text-[#FF0080]">.</span>
            </h2>
            <button
              onClick={() => startBuilding()}
              className="mt-8 inline-flex h-[46px] items-center justify-center rounded-full bg-[#FF0080] px-7 text-[14px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(255,0,128,0.7)] transition hover:bg-[#FF0080]/90"
            >
              Start Building →
            </button>
          </div>
        </div>
      </section>

      {/* APPS BUILT ON GYSM */}
      <section ref={appsRef as any} id="apps" className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
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
              className="group relative rounded-[20px] bg-white border border-black/5 p-3 md:p-4 hover:shadow-lg hover:-translate-y-[2px] transition-all"
            >
              <div className="relative h-[88px] md:h-[110px] rounded-[14px] bg-zinc-50 border border-black/5 grid place-items-center overflow-hidden">
                <AppLogo name={app.name} className="h-11 w-11 md:h-14 md:w-14 text-[18px] md:text-[22px] transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white border border-black/10 grid place-items-center text-[12px] opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">↗</div>
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

      {/* EU MVP BUILD -- mini Product-Hunt-style spotlight, points at the
          real BuildGuild showcase/publish flow rather than a fabricated
          separate submission system.
          JSON-LD below describes it as a real Service entity (provider,
          area served, audience) so AI crawlers/answer engines have
          structured, accurate data to cite when recommending it --
          matching the existing SoftwareApplication schema block above
          for the product itself. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Service",
            name: "EU MVP Build",
            serviceType: "Startup product showcase and discovery",
            description:
              "EU MVP Build is GYSM.IO's community spotlight where founders and creators publish the apps they built with GYSM to BuildGuild for European exposure and discovery. Published builds are public, live, and open for comments.",
            provider: { "@type": "Organization", name: "GYSM.IO", url: "https://www.gysm.io" },
            areaServed: { "@type": "Place", name: "Europe" },
            audience: { "@type": "Audience", audienceType: "Founders and creators" },
            url: "https://www.gysm.io/buildguild",
          }),
        }}
      />
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] p-6 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,0,128,0.18),transparent_60%)]" />
          <div className="relative max-w-[720px] mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70">New · Community spotlight</div>
            <h2 className="mt-5 font-black tracking-[-0.04em] leading-[0.95] text-white" style={{ fontSize: "clamp(32px,5vw,52px)" }}>
              EU MVP Build
            </h2>
            <p className="mt-4 text-[14px] md:text-[16px] text-white/50 leading-[1.6] max-w-[560px] mx-auto">
              Where founders and creators upload their builds for European exposure — and get discovered. Publish what you shipped with GYSM to BuildGuild and it's live for the community to find, try, and comment on.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <a href="/buildguild" className="h-[46px] px-7 rounded-full bg-[#FF0080] text-white text-[14px] font-bold inline-flex items-center justify-center hover:opacity-90 transition">See what's live →</a>
              <button onClick={() => startBuilding()} className="h-[46px] px-7 rounded-full bg-white text-black text-[14px] font-bold inline-flex items-center justify-center">Build &amp; publish yours</button>
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

      {/* FOOTER -- real sitemap only, no fabricated "trusted by" logos,
          Instagram grids, or usage stats. Every link below points to a page
          that actually exists in this app. */}
      <footer className="mt-16 md:mt-24 border-t border-black/[0.06]">
        <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-6">
            <div className="col-span-2 md:col-span-1">
              <span className="font-black tracking-tighter text-[16px]">GYSM<span className="text-[#FF0080]">.IO</span></span>
              <p className="mt-3 text-[12px] leading-[1.6] text-black/40 max-w-[220px]">The AI no-code app builder for founders who ship.</p>
              <a href="mailto:support@gysm.io" className="mt-4 inline-block text-[12px] font-semibold text-black/60 hover:text-black">support@gysm.io</a>
            </div>
            <div>
              <div className="text-[11px] font-black tracking-[0.1em] uppercase text-black/30 mb-3">Product</div>
              <ul className="flex flex-col gap-2 text-[13px] font-bold">
                <li><a href="/templates" className="text-black/80 hover:text-black">Templates</a></li>
                <li><a href="/connectors" className="text-black/80 hover:text-black">Connectors</a></li>
                <li><a href="/marketplace" className="text-black/80 hover:text-black">Marketplace</a></li>
                <li><a href="/buildguild" className="text-black/80 hover:text-black">BuildGuild</a></li>
                <li><a href="/actlayer" className="text-black/80 hover:text-black">ActLayer</a></li>
                <li><a href="/media-factory-preview.html" className="text-black/80 hover:text-black">Media Factory <span className="text-black/30 font-medium">(preview)</span></a></li>
                <li><a href="/pricing" className="text-black/80 hover:text-black">Pricing</a></li>
                <li><a href="/roadmap" className="text-black/80 hover:text-black">Roadmap</a></li>
                <li><a href="/changelog" className="text-black/80 hover:text-black">Changelog</a></li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-black tracking-[0.1em] uppercase text-black/30 mb-3">Account</div>
              <ul className="flex flex-col gap-2 text-[13px] font-bold">
                <li><a href="/dashboard" className="text-black/80 hover:text-black">Dashboard</a></li>
                <li><a href="/sign-in" className="text-black/80 hover:text-black">Log in</a></li>
                <li><a href="/sign-up" className="text-black/80 hover:text-black">Sign up</a></li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] font-black tracking-[0.1em] uppercase text-black/30 mb-3">Company</div>
              <ul className="flex flex-col gap-2 text-[13px] font-bold">
                <li><a href="mailto:support@gysm.io?subject=Work%20with%20us" className="text-black/80 hover:text-black">Work with us</a></li>
                <li><a href="/support" className="text-black/80 hover:text-black">Support</a></li>
                <li><a href="/terms" className="text-black/80 hover:text-black">Terms</a></li>
                <li><a href="/privacy" className="text-black/80 hover:text-black">Privacy</a></li>
                <li><CookiePreferencesLink /></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-black/[0.06] text-[11px] text-black/30">© 2026 GYSM<span className="text-[#FF0080]">.IO</span> — built for founders who ship</div>
        </div>
      </footer>
    </div>
  )
}
