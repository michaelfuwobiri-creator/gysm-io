import type { Metadata } from "next";
import IdeaBlueprint from "@/app/components/IdeaBlueprint";
import { LANDING_USE_CASES } from "@/lib/blueprint";

export const metadata: Metadata = {
  title: "Free App Idea Planner — Turn an Idea into a Build Plan | GYSM",
  description:
    "Describe your app, store or site in plain English and get an instant build plan: page sections, features, data model and a ready-to-use prompt. Free, no sign-up, then build it with GYSM.",
  alternates: { canonical: "https://www.gysm.io/blueprint" },
  openGraph: {
    title: "Free App Idea Planner | GYSM",
    description: "Describe your app, store or site in plain English and get an instant build plan. Free, no sign-up.",
    url: "https://www.gysm.io/blueprint",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Free App Idea Planner | GYSM", description: "Describe your app, store or site in plain English and get an instant build plan. Free, no sign-up." },
};

export default function Page() {
  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased selection:bg-[#FF0080] selection:text-white">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <nav className="h-[56px] md:h-[64px] flex items-center border-b border-black/[0.05]">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="font-black tracking-tighter text-[16px]">GYSM</a>
          <a href="/pricing" className="text-[13px] font-medium opacity-60">Pricing</a>
        </div>
      </nav>
      <main className="max-w-[1100px] mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-20">
        <div className="text-center">
          <div className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">Free · no sign-up · instant</div>
          <h1 className="mt-6 mx-auto max-w-[820px] text-[36px] leading-[0.95] md:text-[68px] font-black tracking-[-0.05em]">
            Turn your idea into a <span className="text-[#FF0080]">build plan.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">
            Say what you want to make. See the sections, features and data it needs, then open it in the GYSM builder with a better prompt than a blank page.
          </p>
        </div>
        <div className="mt-10"><IdeaBlueprint source="blueprint_page" /></div>

        <section className="mt-20">
          <h2 className="text-[24px] md:text-[34px] font-black tracking-[-0.03em] text-center">Plans for common projects</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {LANDING_USE_CASES.map((u) => (
              <a key={u.slug} href={u.path} className="rounded-[20px] bg-white border border-black/5 p-5 hover:border-black/20 transition">
                <div className="text-[15px] font-bold">{u.name}</div>
                <div className="mt-2 text-[13.5px] leading-[1.6] opacity-60">{u.audience}</div>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
