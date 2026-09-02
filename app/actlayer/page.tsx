import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ActLayer — EU AI Act & GDPR compliance scanner | GYSM.IO",
  description:
    "Scan any AI product for EU AI Act and GDPR/cookie-consent gaps in under a minute, and get the exact fix for each one. Built with GYSM.IO.",
};

const CHECKS = [
  { category: "Cookies & tracking", items: ["Consent banner present", "Granular consent (not just “Accept all”)", "Analytics/ad scripts gated behind consent"] },
  { category: "AI disclosure", items: ["Visible AI-generated content disclosure", "Machine-readable AI-generated marking (EU AI Act Art. 50)", "Chat widgets disclose they're AI"] },
  { category: "Privacy policy", items: ["Names AI sub-processors", "GDPR/CCPA rights section", "Cookies covered, contact method present, kept up to date"] },
];

export default function ActLayerPage() {
  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="text-fuchsia-500">.IO</span>
          </a>
          <a href="/" className="text-[11px] opacity-50 hover:opacity-100">Back to gysm.io</a>
        </div>

        <p className="text-center text-[12px] font-bold uppercase tracking-[0.15em] text-fuchsia-500 mb-3">
          Built with GYSM.IO
        </p>
        <h1 className="text-4xl md:text-5xl font-black text-center tracking-tighter mb-4 leading-[1.05]">
          Is your AI product breaking the EU AI Act?
        </h1>
        <p className="text-center opacity-60 mb-8 max-w-lg mx-auto">
          ActLayer scans any site for EU AI Act transparency gaps and GDPR/cookie-consent issues in under a
          minute -- free scan, exact fix for anything that's missing.
        </p>

        <div className="flex justify-center mb-14">
          <a
            href="https://actlayer.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-full bg-black text-white font-bold hover:opacity-90 transition"
          >
            Scan your site free →
          </a>
        </div>

        <div className="flex flex-col gap-8">
          {CHECKS.map((group) => (
            <div key={group.category} className="pb-8 border-b border-black/[0.06]">
              <h3 className="font-bold text-[15px] mb-3">{group.category}</h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item} className="text-[13.5px] text-black/60 flex gap-2">
                    <span className="text-emerald-600">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-center text-[12px] text-black/35 mt-10">
          A technical/content scan, not legal advice.{" "}
          <a href="https://actlayer.eu" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">
            actlayer.eu
          </a>
        </p>

        <div className="h-16" />
      </div>
    </div>
  );
}
