import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ComparisonShell, { gysmPriceSummary } from "@/app/components/ComparisonShell";
import JsonLd from "@/app/components/JsonLd";
import { CHECKED_ON, GYSM_FACTS, RIVALS, getRival } from "@/lib/comparisons";

const siteUrl = "https://www.gysm.io";

export function generateStaticParams() {
  return RIVALS.filter((r) => r.page).map((r) => ({ slug: r.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const rival = getRival(params.slug);
  if (!rival) return {};
  const title = `${rival.name} alternative: GYSM vs ${rival.name} compared`;
  const description = `How GYSM compares with ${rival.name} on pricing, what you get from a build, code export, backend and teams. Sourced from official pages, checked ${CHECKED_ON}.`;
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/alternatives/${rival.slug}` },
    openGraph: { title, description, url: `${siteUrl}/alternatives/${rival.slug}`, siteName: "GYSM", type: "article" },
  };
}

export default function Page({ params }: { params: { slug: string } }) {
  const rival = getRival(params.slug);
  if (!rival) notFound();

  const faqs = [
    {
      q: `What is the difference between GYSM and ${rival.name}?`,
      a: `GYSM turns a plain-English description into a complete web page you can preview, copy, download, push to GitHub and publish. ${rival.name} lists: ${rival.listed.join("; ")}. GYSM currently produces a single HTML page per build and does not have an in-product multi-file code editor.`,
    },
    {
      q: `How much does ${rival.name} cost compared with GYSM?`,
      a: `${rival.name}: ${rival.pricing} (as listed on ${CHECKED_ON}). GYSM: ${gysmPriceSummary()}. Prices change, so check each product's own pricing page.`,
    },
    {
      q: `Can I move a GYSM project to GitHub?`,
      a: `Yes. You can download the project, or connect a GitHub repo with a token you paste in. Push sends your build as a commit and Pull loads the repo's index.html back in as a new version. Sync covers a single index.html, not a multi-file repository.`,
    },
  ];

  const rows: [string, string, string][] = [
    ["Pricing", gysmPriceSummary(), rival.pricing],
    ["Usage allowance", "Credits per build; packs never expire", rival.allowance],
    ["What you get", GYSM_FACTS.output, rival.listed.join("; ")],
    ["Code and Git", GYSM_FACTS.codeExport, rival.listed.find((l) => /git|code/i.test(l)) ?? "Not listed on its pricing page"],
    ["Backend and hosting", GYSM_FACTS.backend + ". " + GYSM_FACTS.hosting + ".", rival.listed.find((l) => /database|auth|hosting/i.test(l)) ?? "Not listed on its pricing page"],
    ["Teams and access", GYSM_FACTS.teams, rival.listed.find((l) => /SSO|roles|collaborat|audit/i.test(l)) ?? "Not listed on its pricing page"],
  ];

  return (
    <ComparisonShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <p className="text-[12px] font-black tracking-[0.1em] uppercase text-black/40">Comparison</p>
      <h1 className="mt-2 text-[30px] md:text-[44px] font-black tracking-[-0.03em] leading-[1]">
        {rival.name} alternative: GYSM vs {rival.name}
      </h1>
      <p className="mt-4 text-[16px] text-black/70 max-w-[680px]">
        GYSM is an AI app builder: describe an app in plain English and get a working web page back, which you can
        preview, copy, download, push to GitHub and publish. This page compares it with {rival.name} using each
        product&apos;s own pages, checked {CHECKED_ON}, and says where {rival.name} is the better fit.
      </p>

      <h2 className="mt-12 text-[22px] font-black tracking-tight">Side by side</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-black/10">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-black/[0.03] text-[12px] uppercase tracking-wide text-black/50">
            <tr>
              <th className="p-3 font-bold"></th>
              <th className="p-3 font-bold">GYSM</th>
              <th className="p-3 font-bold">{rival.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className="border-t border-black/10 align-top">
                <th className="p-3 font-bold whitespace-nowrap">{label}</th>
                <td className="p-3">{a}</td>
                <td className="p-3">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-12 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-[20px] font-black tracking-tight">Choose {rival.name} if</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-[15px] text-black/75">
            {rival.chooseRival.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-[20px] font-black tracking-tight">Choose GYSM if</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-[15px] text-black/75">
            <li>You want to go from a plain-English description to a published, installable web app quickly.</li>
            <li>You prefer paying for credits that never expire over a monthly subscription.</li>
            <li>You want more than a builder: {GYSM_FACTS.extras}.</li>
          </ul>
        </section>
      </div>

      <section className="mt-12">
        <h2 className="text-[20px] font-black tracking-tight">Where GYSM is behind today</h2>
        <ul className="mt-3 list-disc pl-5 space-y-2 text-[15px] text-black/75">
          {GYSM_FACTS.limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-[22px] font-black tracking-tight">Frequently asked questions</h2>
        <div className="mt-4 space-y-6">
          {faqs.map((f) => (
            <div key={f.q}>
              <h3 className="text-[16px] font-bold">{f.q}</h3>
              <p className="mt-1 text-[15px] text-black/70">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[16px] font-black tracking-tight">Sources for {rival.name}, read {CHECKED_ON}</h2>
        <ul className="mt-2 list-disc pl-5 text-[14px]">
          {rival.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} rel="noopener noreferrer" className="underline">{s.label}</a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px]">
          See also: <a href="/best-ai-app-builder" className="underline">best AI app builders compared</a>.
        </p>
      </section>
    </ComparisonShell>
  );
}
