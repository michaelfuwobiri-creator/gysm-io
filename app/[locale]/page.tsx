"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import CookiePreferencesLink from "../components/CookiePreferencesLink";
import LanguageSwitcher from "../components/LanguageSwitcher";
import ProductsNavMenu from "../components/ProductsNavMenu";
import { trackEvent } from "@/lib/analytics/track";

const NavAuthLink = dynamic(() => import("../components/NavAuthLink"), { ssr: false });

const INDEX_SECTIONS = [
  { id: "hero", label: "Home" },
  { id: "highlights", label: "Highlights" },
] as const;

export default function Page() {
  const t = useTranslations("Home");
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeSection, setActiveSection] = useState<string>("hero");

  const heroRef = useRef<HTMLElement | null>(null);
  const highlightsRef = useRef<HTMLElement | null>(null);

  // Real parallax: the hero background drifts with scroll position and the
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
    trackEvent("build_clicked", { hasPrompt: !!p });
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
            <ProductsNavMenu />
            <a href="/buildguild" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">BuildGuild</a>
            <a href="/templates" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">{t("nav.templates")}</a>
            <a href="/connectors" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Connectors</a>
            <a href="/marketplace" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Marketplace</a>
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">{t("nav.pricing")}</a>
            <NavAuthLink />
            <button onClick={() => startBuilding()} className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">{t("nav.startBuilding")}</button>
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
            {t("hero.titleLine1")} <span className="bg-gradient-to-r from-[#FF0080] to-[#FF0080] bg-clip-text text-transparent">{t("hero.titleHighlight")}</span>,{" "}
            <span className="block md:inline">{t("hero.titleLine2")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] md:text-[18px] leading-[1.5] font-medium text-white/60">
            <span className="mb-1 block text-[12px] italic text-white/40">{t("hero.tagline")}</span>
            {t("hero.subtitle")}
          </p>

          <div className="mx-auto mt-7 max-w-[560px]">
            <div className="flex flex-col sm:flex-row gap-2 rounded-[20px] sm:rounded-full border border-black/10 bg-white p-2 shadow-sm">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startBuilding()}
                placeholder={t("hero.placeholder")}
                className="flex-1 h-[44px] px-4 rounded-full outline-none text-[14px]"
              />
              <button
                onClick={() => startBuilding()}
                disabled={starting}
                className="h-[44px] px-6 rounded-full bg-black text-white font-bold text-[14px] shrink-0 disabled:opacity-50"
              >
                {starting ? t("hero.ctaLoading") : t("hero.cta")}
              </button>
            </div>
            <div className="mt-3 text-[12px] text-white/40 font-medium">{t("hero.helper")}</div>
          </div>
        </div>

        <button
          onClick={() => scrollToId("highlights")}
          className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-white/60 transition hover:text-white"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{t("hero.scroll")}</span>
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
            <h3 className="mb-4 text-[12px] font-black uppercase tracking-[0.14em] opacity-30">{t("highlights.eyebrow")}</h3>
            <h2 className="text-[28px] md:text-[52px] font-black leading-[0.9] tracking-[-0.03em]">{t("highlights.title")}</h2>
            <p className="mx-auto mt-4 max-w-[560px] text-[14px] md:text-[16px] leading-[1.6] opacity-60">
              {t("highlights.subtitle")}
            </p>
            {/* Bug fix / restructure: this used to scrollToId("apps") into
                a long homepage that kept going for another 5 sections
                (story cards, a repeat CTA, an app showcase grid, an EU MVP
                spotlight, a pricing teaser) before the footer. Mike asked
                to end the homepage right here, at this button -- so it now
                links straight to /buildguild, where that showcase grid
                actually lives now (see app/buildguild/FeaturedApps.tsx).
                The removed sections weren't deleted outright: the EU MVP
                spotlight and pricing teaser were pure duplicates of
                content /buildguild and /pricing already cover in full, and
                the app showcase grid was moved rather than dropped. */}
            <a href="/buildguild" className="mt-8 inline-flex h-10 items-center justify-center rounded-full border border-black/10 bg-white px-6 text-[13px] font-medium tracking-[-0.01em] shadow-sm transition hover:border-black/20 hover:shadow">
              {t("highlights.cta")}
            </a>
          </div>
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
              <p className="mt-3 text-[12px] leading-[1.6] text-black/40 max-w-[220px]">{t("footer.tagline")}</p>
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
      <LanguageSwitcher />
    </div>
  )
}
