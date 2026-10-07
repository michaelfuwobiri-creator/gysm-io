import type { Metadata } from "next";
import ComparisonShell, { gysmPriceSummary } from "@/app/components/ComparisonShell";
import JsonLd from "@/app/components/JsonLd";
import { CHECKED_ON, GYSM_FACTS, RIVALS } from "@/lib/comparisons";

const siteUrl = "https://www.gysm.io";
const title = "Best AI app builders compared: GYSM, Lovable, Bolt, v0, Base44 and Replit";
const description = `Pricing and listed features for six AI app builders, read from each product's own pages on ${CHECKED_ON}, with a plain statement of where each one fits.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${siteUrl}/best-ai-app-builder` },
  openGraph: { title, description, url: `${siteUrl}/best-ai-app-builder`, siteName: "GYSM", type: "article" },
};

export default function Page() {
  const faqs = [
    {
      q: "What is the best AI app builder?",
      a: "It depends on what you need. For multi-file projects with an in-product code editor, products such as Lovable and Replit list those capabilities. For a fast route from a description to a published web page, with credits that do not expire, GYSM is built for that. Compare pricing and listed features before choosing.",
    },
    {
      q: "Which AI app builders have a free plan?",
      a: "Lovable, Bolt, v0 and Base44 list a free plan on their pricing pages as of " + CHECKED_ON + ". Replit lists paid Core and Pro plans and a free mode. GYSM offers a free account to try the builder.",
    },
    {
      q: "What does GYSM cost?",
      a: `As shown on the GYSM pricing page: ${gysmPriceSummary()}.`,
    },
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
        Best AI app builders compared
      </h1>
      <p className="mt-4 text-[16px] text-black/70 max-w-[680px]">
        Six AI app builders, compared on what their own pricing and plans pages listed on {CHECKED_ON}. GYSM publishes
        this page, so it also states where GYSM is behind.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-black/10">
        <table className="w-full text-left text-[14px]">
          <thead className="bg-black/[0.03] text-[12px] uppercase tracking-wide text-black/50">
            <tr>
              <th className="p-3 font-bold">Product</th>
              <th className="p-3 font-bold">Plans and price</th>
              <th className="p-3 font-bold">Listed features</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-black/10 align-top bg-black/[0.02]">
              <th className="p-3 font-bold">GYSM</th>
              <td className="p-3">{gysmPriceSummary()}</td>
              <td className="p-3">
                {GYSM_FACTS.output}. {GYSM_FACTS.codeExport}. {GYSM_FACTS.hosting}.
              </td>
            </tr>
            {RIVALS.map((r) => (
              <tr key={r.slug} className="border-t border-black/10 align-top">
                <th className="p-3 font-bold">
                  {r.page ? (
                    <a href={`/alternatives/${r.slug}`} className="underline">{r.name}</a>
                  ) : (
                    r.name
                  )}
                </th>
                <td className="p-3">{r.pricing}</td>
                <td className="p-3">{r.listed.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <h2 className="text-[16px] font-black tracking-tight">Sources, read {CHECKED_ON}</h2>
        <ul className="mt-2 list-disc pl-5 text-[14px]">
          {RIVALS.flatMap((r) => r.sources).map((s) => (
            <li key={s.url}>
              <a href={s.url} rel="noopener noreferrer" className="underline">{s.label}</a>
            </li>
          ))}
          <li><a href="/pricing" className="underline">GYSM pricing</a></li>
        </ul>
      </section>
    </ComparisonShell>
  );
}
