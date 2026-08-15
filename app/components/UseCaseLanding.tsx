"use client";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export type UseCasePoint = { title: string; body: string };

export type UseCaseLandingProps = {
  badge: string;
  headlineLead: string;
  headlineHighlight: string;
  headlineTail?: string;
  subheadline: string;
  examplePrompt: string;
  promptPlaceholder: string;
  screenshot: { src: string; alt: string; caption: string };
  points: UseCasePoint[];
  proofScreenshot: { src: string; alt: string; caption: string };
  faqNote: string;
};

export default function UseCaseLanding({
  badge,
  headlineLead,
  headlineHighlight,
  headlineTail,
  subheadline,
  examplePrompt,
  promptPlaceholder,
  screenshot,
  points,
  proofScreenshot,
  faqNote,
}: UseCaseLandingProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  function startBuilding(promptText: string) {
    window.localStorage.setItem("gysm_pending_prompt", promptText);
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

      {/* NAV */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2"><div className="h-7 w-7 rounded-[8px] bg-black text-white grid place-items-center font-black text-[13px]">G</div><span className="font-black tracking-tighter text-[16px]">GYSM.IO</span></a>
          <div className="flex items-center gap-2">
            <a href="/buildguild" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">BuildGuild</a>
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Pricing</a>
            <a href="/sign-in" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Log in</a>
            <button onClick={() => startBuilding(examplePrompt)} className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">Start Building</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">{badge}</div>
        <h1 className="mt-6 mx-auto max-w-[820px] text-[36px] leading-[0.95] md:text-[72px] font-black tracking-[-0.05em]">
          {headlineLead}{" "}
          <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">{headlineHighlight}</span>
          {headlineTail ? <>{" "}{headlineTail}</> : null}
        </h1>
        <p className="mx-auto mt-4 max-w-[540px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">{subheadline}</p>

        <div className="mt-7 mx-auto max-w-[620px]">
          <div className="flex flex-col sm:flex-row gap-2 rounded-[20px] sm:rounded-full border border-black/10 bg-white p-2 shadow-sm text-left">
            <div className="flex-1 h-[44px] px-4 rounded-full flex items-center text-[13.5px] text-black/70 overflow-hidden whitespace-nowrap text-ellipsis">{promptPlaceholder}</div>
            <button
              onClick={() => startBuilding(examplePrompt)}
              className="h-[44px] px-6 rounded-full bg-black text-white font-bold text-[14px] shrink-0"
            >
              Generate my app →
            </button>
          </div>
          <div className="mt-3 text-[12px] text-black/40 font-medium">Live preview in seconds • auth, database, and payments included</div>
        </div>
      </section>

      {/* PRODUCT SCREENSHOT */}
      <section className="max-w-[1100px] mx-auto px-5 md:px-8 mt-10 md:mt-14">
        <div className="rounded-[20px] md:rounded-[28px] overflow-hidden border border-black/10 shadow-xl bg-white">
          <img src={screenshot.src} alt={screenshot.alt} className="w-full h-auto block" />
        </div>
        <div className="mt-3 text-center text-[12px] text-black/40 font-medium">{screenshot.caption}</div>
      </section>

      {/* USE-CASE POINTS */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <h2 className="text-[26px] md:text-[38px] font-black tracking-[-0.03em] leading-[0.95] text-center max-w-[640px] mx-auto">Built for how you actually work</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-3 md:gap-4">
          {points.map((p) => (
            <div key={p.title} className="rounded-[20px] bg-white border border-black/5 p-5 md:p-6">
              <div className="text-[15px] font-bold">{p.title}</div>
              <div className="mt-2 text-[13.5px] leading-[1.6] opacity-60">{p.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL PROOF SCREENSHOT */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-14 md:mt-24">
        <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] p-6 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)]" />
          <div className="relative grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white/70">BuildGuild</div>
              <h2 className="mt-5 font-black tracking-[-0.04em] leading-[0.95] text-white text-[28px] md:text-[40px]">
                Real people, shipping real products.
              </h2>
              <p className="mt-4 text-[14px] md:text-[16px] text-white/50 leading-[1.6] max-w-[440px]">
                Every GYSM build can be published to BuildGuild, GYSM's public showcase. Browse what other founders and indie hackers have already shipped.
              </p>
              <div className="mt-6">
                <a href="/buildguild" className="h-[46px] px-7 rounded-full bg-white text-black text-[14px] font-bold inline-flex items-center justify-center">Browse BuildGuild →</a>
              </div>
            </div>
            <div className="rounded-[20px] overflow-hidden border border-white/10 bg-black">
              <img src={proofScreenshot.src} alt={proofScreenshot.alt} className="w-full h-auto block" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-10 px-3 md:px-6">
        <div className="max-w-[1280px] mx-auto">
          <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] px-6 py-16 md:py-24 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)]" />
            <div className="relative">
              <h2 className="font-black tracking-[-0.05em] leading-[0.85]">
                <span className="block text-white" style={{ fontSize: "clamp(32px,7vw,64px)" }}>Stop planning.</span>
                <span className="block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent" style={{ fontSize: "clamp(32px,7vw,64px)" }}>Describe it and ship.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-[460px] text-[14px] md:text-[16px] text-white/50 leading-[1.5]">{faqNote}</p>
              <button onClick={() => startBuilding(examplePrompt)} className="mt-8 inline-flex h-[48px] px-8 rounded-full bg-white text-black text-[14px] font-bold items-center justify-center">Start Building →</button>
              <div className="mt-3 text-[11px] text-white/30">Credit packs from $9 • cancel monthly plans anytime</div>
            </div>
          </div>
          <div className="py-6 text-center text-[11px] text-black/30">© 2026 GYSM.IO — built for founders who ship</div>
        </div>
      </section>
    </div>
  );
}
