import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IdeaBlueprint from "@/app/components/IdeaBlueprint";
import TrackUseCaseViewed from "./TrackUseCaseViewed";
import { LANDING_USE_CASES, SITE_URL, getUseCase } from "@/lib/blueprint";
import { GYSM_FACTS } from "@/lib/comparisons";

// Data-driven landing pages for use cases that do not have a hand-built
// page (online store, restaurant, coaching, portfolio, event, nonprofit).
// The hand-built /build/saas, /build/booking-app and /build/dating-app pages
// are static routes and keep winning over this dynamic one. Content comes
// from lib/blueprint.ts so a page, the instant planner and the MCP tools
// always say the same true thing, including the limits.
export const dynamicParams = false;

export function generateStaticParams() {
  return LANDING_USE_CASES.map((u) => ({ slug: u.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const u = getUseCase(params.slug);
  if (!u || !u.landing) return {};
  const title = `${u.headline} | GYSM`;
  const description = `${u.summary} Free instant plan, no sign-up. Built with GYSM, the AI app builder.`;
  return { title, description, alternates: { canonical: `${SITE_URL}${u.path}` }, openGraph: { title, description, url: `${SITE_URL}${u.path}`, type: "website" } };
}

export default function Page({ params }: { params: { slug: string } }) {
  const u = getUseCase(params.slug);
  if (!u || !u.landing) notFound();

  const faq = [
    ...u.faq,
    { q: "What are GYSM's limits?", a: GYSM_FACTS.limits.join(" ") },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GYSM", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Build", item: `${SITE_URL}/blueprint` },
          { "@type": "ListItem", position: 3, name: u.name, item: `${SITE_URL}${u.path}` },
        ],
      },
    ],
  };

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased selection:bg-[#FF0080] selection:text-white">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TrackUseCaseViewed slug={u.slug} />
      <nav className="h-[56px] md:h-[64px] flex items-center border-b border-black/[0.05]">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="font-black tracking-tighter text-[16px]">GYSM</a>
          <div className="flex items-center gap-4 text-[13px] font-medium opacity-70">
            <a href="/blueprint" className="hidden md:block">Idea planner</a>
            <a href="/buildguild" className="hidden md:block">BuildGuild</a>
            <a href="/pricing">Pricing</a>
          </div>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-5 md:px-8 pt-10 md:pt-20 pb-20">
        <div className="text-center">
          <div className="inline-flex rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm">AI app builder for {u.audience.charAt(0).toLowerCase() + u.audience.slice(1)}</div>
          <h1 className="mt-6 mx-auto max-w-[860px] text-[34px] leading-[0.98] md:text-[60px] font-black tracking-[-0.05em]">{u.headline}</h1>
          <p className="mx-auto mt-4 max-w-[600px] text-[15px] md:text-[18px] leading-[1.5] text-black/60 font-medium">{u.summary}</p>
        </div>

        <div className="mt-10"><IdeaBlueprint initialIdea={u.examplePrompt} source={`build_${u.slug}`} /></div>

        <section className="mt-20 grid gap-3 md:grid-cols-2">
          <div className="rounded-[20px] bg-white border border-black/5 p-6">
            <h2 className="text-[18px] font-black tracking-[-0.02em]">What the page includes</h2>
            <ul className="mt-3 space-y-1.5 text-[14px] text-black/70">{u.sections.map((s) => <li key={s}>• {s}</li>)}</ul>
          </div>
          <div className="rounded-[20px] bg-white border border-black/5 p-6">
            <h2 className="text-[18px] font-black tracking-[-0.02em]">Works with your own tools</h2>
            <ul className="mt-3 space-y-1.5 text-[14px] text-black/70">{u.integrations.map((s) => <li key={s}>• {s}</li>)}</ul>
            <p className="mt-3 text-[12.5px] text-black/45">GYSM never holds your payment keys or your money.</p>
          </div>
        </section>

        <section className="mt-16 max-w-[760px] mx-auto">
          <h2 className="text-[24px] md:text-[32px] font-black tracking-[-0.03em]">Questions</h2>
          <div className="mt-5 divide-y divide-black/10 rounded-[20px] border border-black/10 bg-white">
            {faq.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer text-[15px] font-bold">{f.q}</summary>
                <p className="mt-2 text-[14px] leading-[1.6] text-black/65">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 text-center">
          <p className="text-[13px] text-black/50">More plans: {LANDING_USE_CASES.filter((x) => x.slug !== u.slug).map((x, i, a) => (<span key={x.slug}><a className="underline" href={x.path}>{x.name}</a>{i < a.length - 1 ? ", " : ""}</span>))}</p>
        </section>
      </main>
    </div>
  );
}
