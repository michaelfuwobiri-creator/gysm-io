"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const FAQ = [
  { q: "How does pricing work?", a: "Every build costs credits. Starter and Agency are monthly plans with a set number of builds; Flex packs are pay-as-you-go with no subscription." },
  { q: "What can I actually build?", a: "Describe any web app — a storefront, a booking page, a dashboard, a landing page — and GYSM generates a working, styled preview you can iterate on." },
  { q: "Can I export the code?", a: "Yes. Every generated build can be copied as code or deployed directly from the builder." },
  { q: "Do I need a credit card to try it?", a: "You need an account and an active plan to generate — there's no free tier right now. Pick the smallest Flex pack if you just want to try it out." },
];

export default function Page() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [starting, setStarting] = useState(false);

  async function startBuilding(promptText?: string) {
    const p = (promptText ?? prompt).trim();
    setStarting(true);
    if (p) {
      window.localStorage.setItem("gysm_pending_prompt", p);
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      router.push("/builder");
    } else {
      router.push(`/auth?redirect=${encodeURIComponent("/builder")}`);
    }
  }

  return(
    <div style={{fontFamily:"Inter,sans-serif"}} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased overflow-x-clip selection:bg-violet-600 selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* NAV */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <div className="flex items-center gap-2"><div className="h-7 w-7 rounded-[8px] bg-black text-white grid place-items-center font-black text-[13px]">G</div><span className="font-black tracking-tighter text-[16px]">GYSM.IO</span></div>
          <div className="flex items-center gap-2">
            <a href="/pricing" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Pricing</a>
            <button onClick={() => startBuilding()} className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">Start Building</button>
          </div>
        </div>
      </nav>

      {/* HERO - phone first */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-6 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">🔥 Trending on X • 10k+ apps shipped</div>
        <h1 className="mt-6 mx-auto max-w-[820px] text-[40px] leading-[0.9] md:text-[84px] font-black tracking-[-0.05em]">
          Build apps<br/>10x faster<br/>than <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent">coding</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[480px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">Turn your idea into a real app that makes money. No code. Just ship.</p>

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
              {starting ? "One sec…" : "Generate my website"}
            </button>
          </div>
          <div className="mt-3 text-[12px] text-black/40 font-medium">Live in 5 seconds • credits used per build</div>
        </div>
      </section>

      {/* TESTIMONIALS ON TOP - MARQUEE FOR MOBILE */}
      <section className="mt-8 md:mt-14 overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-5 flex items-center justify-between mb-4">
          <h3 className="text-[12px] font-black tracking-[0.14em] opacity-30 uppercase">Loved by founders</h3>
          <div className="flex items-center gap-1 text-[12px]">⭐⭐⭐⭐⭐ <span className="font-bold ml-1">4.9/5</span><span className="opacity-40 ml-1">(2.4k)</span></div>
        </div>
        <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-none snap-x" style={{scrollbarWidth:"none"}}>
          {[
            {name:"Sarah J.", role:"Sold her app for $40k", text:"I built my dog-walking Uber in 1 afternoon. Made $2k first week.", avatar:"bg-violet-200"},
            {name:"Marcus T.", role:"$12k MRR", text:"GYSM is insane. My AI SaaS was live before my coffee got cold.", avatar:"bg-orange-200"},
            {name:"Priya K.", role:"YC W24", text:"Investors thought I had a dev team of 10. It was just me + GYSM.", avatar:"bg-emerald-200"},
            {name:"David L.", role:"2 apps shipped", text:"From idea to Stripe payments in 20 minutes. No joke.", avatar:"bg-blue-200"},
            {name:"Alex R.", role:"Indie hacker", text:"Cancelled Lovable. GYSM actually ships production apps.", avatar:"bg-fuchsia-200"},
          ].map(t=>(
            <div key={t.name} className="snap-start min-w-[280px] max-w-[280px] md:min-w-[320px] rounded-[20px] bg-white border border-black/5 p-5 shadow-sm shrink-0">
              <div className="flex items-center gap-3"><div className={`h-9 w-9 rounded-full ${t.avatar}`} /><div><div className="text-[13px] font-bold leading-none">{t.name}</div><div className="text-[11px] opacity-50 mt-1">{t.role}</div></div></div>
              <div className="mt-3 text-[13.5px] leading-[1.5] font-medium">"{t.text}"</div>
            </div>
          ))}
        </div>
      </section>

      {/* SKILLA BABY SONG SECTION */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-12 md:mt-20">
        <div className="rounded-[28px] md:rounded-[32px] bg-black text-white p-5 md:p-8 flex flex-col md:flex-row gap-5 md:gap-8 items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(168,85,247,0.25),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(236,72,153,0.2),transparent_60%)]" />
          <div className="relative h-[160px] w-[160px] md:h-[180px] md:w-[180px] rounded-[20px] bg-gradient-to-br from-violet-600 to-fuchsia-600 grid place-items-center shrink-0">
            <div className="text-[56px]">🎧</div>
            <div className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-white text-black grid place-items-center text-[12px]">▶</div>
          </div>
          <div className="relative flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-widest">OFFICIAL ANTHEM</div>
            <h3 className="mt-3 text-[26px] md:text-[32px] font-black leading-[0.9] tracking-[-0.02em]">Skilla Baby x GYSM<br/><span className="text-white/40">"Girls Young Rich"</span></h3>
            <p className="mt-2 text-[13px] text-white/60 max-w-[420px]">The founder anthem. Built an app to this in the studio.</p>
            <div className="mt-4 flex gap-2 justify-center md:justify-start">
              <audio ref={audioRef} src="https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a6502a.mp3" className="hidden" />
              <button onClick={()=>audioRef.current?.play()} className="h-10 px-5 rounded-full bg-white text-black text-[13px] font-bold">▶ Play Anthem</button>
              <a href="https://open.spotify.com" target="_blank" className="h-10 px-5 rounded-full bg-white/10 border border-white/10 text-white text-[13px] font-semibold grid place-items-center">Spotify</a>
            </div>
          </div>
        </div>
      </section>

      {/* APPS BUILT ON GYSM */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-12 md:mt-24">
        <div className="flex items-end justify-between">
          <h2 className="text-[28px] md:text-[40px] font-black tracking-[-0.03em] leading-[0.9]">Apps built<br/>on GYSM</h2>
          <a href="/templates" className="text-[13px] font-semibold underline underline-offset-4 opacity-60">Explore →</a>
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            {name:"PawsWalk", tag:"$4.2k MRR", color:"from-orange-100 to-amber-100", icon:"🐾"},
            {name:"FitTrack AI", tag:"12k users", color:"from-violet-100 to-fuchsia-100", icon:"💪"},
            {name:"InvoiceFlow", tag:"$8k MRR", color:"from-emerald-100 to-teal-100", icon:"🧾"},
            {name:"DateMate", tag:"Trending", color:"from-pink-100 to-rose-100", icon:"❤️"},
            {name:"ShopLite", tag:"Acquired", color:"from-blue-100 to-cyan-100", icon:"🛒"},
            {name:"StudySnap", tag:"2.4k users", color:"from-yellow-100 to-orange-100", icon:"📚"},
            {name:"FoodDash", tag:"$2.1k MRR", color:"from-red-100 to-orange-100", icon:"🍔"},
            {name:"MindSpace", tag:"Top Product Hunt", color:"from-indigo-100 to-violet-100", icon:"🧘"},
          ].map(app=>(
            <div key={app.name} className="group rounded-[20px] bg-white border border-black/5 p-3 md:p-4 hover:shadow-lg transition">
              <div className={`h-[88px] md:h-[110px] rounded-[14px] bg-gradient-to-br ${app.color} grid place-items-center text-[28px]`}>{app.icon}</div>
              <div className="mt-3 flex items-center justify-between"><div className="text-[13px] font-bold">{app.name}</div><div className="text-[10px] font-bold px-2 py-1 rounded-full bg-black text-white">{app.tag}</div></div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="max-w-[1280px] mx-auto px-5 md:px-8 mt-12 md:mt-20">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-black text-white grid place-items-center font-black">∞</div><div><div className="text-[14px] font-bold">Pay only for the builds you ship</div><div className="text-[12px] opacity-50">Plans from €10 • credit packs or monthly, your call</div></div></div>
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

      {/* EMPIRE CTA - SAME SHADE */}
      <section className="mt-10 px-3 md:px-6">
        <div className="max-w-[1280px] mx-auto">
          <div className="relative rounded-[28px] md:rounded-[40px] overflow-hidden bg-[#0A0A0A] px-6 py-16 md:py-24 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.18),transparent_60%)]" />
            <div className="relative">
              <h2 className="font-black tracking-[-0.05em] leading-[0.85]">
                <span className="block text-white" style={{fontSize:"clamp(36px,8vw,72px)"}}>Ready to build</span>
                <span className="block bg-gradient-to-r from-violet-600 via-fuchsia-500 to-violet-600 bg-clip-text text-transparent" style={{fontSize:"clamp(36px,8vw,72px)"}}>your empire?</span>
              </h2>
              <p className="mx-auto mt-5 max-w-[460px] text-[14px] md:text-[16px] text-white/50 leading-[1.5]">Your competitors are shipping. You're still reading. Start now.</p>
              <button onClick={() => startBuilding()} className="mt-8 inline-flex h-[48px] px-8 rounded-full bg-white text-black text-[14px] font-bold items-center justify-center">Start Building →</button>
              <div className="mt-3 text-[11px] text-white/30">Credits from €10 • cancel monthly plans anytime</div>
            </div>
          </div>
          <div className="py-6 text-center text-[11px] text-black/30">© 2026 GYSM.IO — Built for founders who ship</div>
        </div>
      </section>
    </div>
  )
}
