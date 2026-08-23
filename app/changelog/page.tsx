import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog | GYSM.IO",
  description: "What's shipped on GYSM.IO recently.",
};

// Plain code array, not a DB table -- changelog entries are dev-authored
// (like PRICING_PLANS in lib/stripe.ts), not user-generated, so a table +
// admin UI would be more machinery than this needs. Every entry below
// describes something that actually shipped in this app, in this repo's
// real commit history -- no invented feature history, no backdated
// entries for things that didn't happen.
type Entry = {
  date: string;
  title: string;
  body: string;
};

const ENTRIES: Entry[] = [
  {
    date: "2026-08-23",
    title: "Deploy any build to your own Vercel account",
    body: "Every project's \"...\" menu on the dashboard now has \"Deploy to Vercel\" -- downloads your build as a ready-to-deploy folder and opens vercel.com/new so you can drag it straight onto your own account. GYSM never sees your Vercel login.",
  },
  {
    date: "2026-08-23",
    title: "Fixed a hydration bug on the homepage, pricing, and marketplace pages",
    body: "Pages were throwing React hydration errors on load in some cases -- root-caused to a few different things (a page reading URL query params in a way that forced full re-rendering on every visit, and font names getting mis-escaped inside an inline stylesheet) and fixed at the source on each affected page.",
  },
  {
    date: "2026-08-23",
    title: "Google Fonts loading fixed app-wide",
    body: "Inter (and Instrument Serif on a couple of pages) was silently failing to load and falling back to system fonts everywhere, caused by a broken font URL. Fixed across every page that loads a custom font.",
  },
  {
    date: "2026-08-23",
    title: "Bolder footer, added \"Work with us\"",
    body: "The homepage footer's Product, Account, and Company columns are now bold instead of regular weight, and \"Work with us\" was added as a real contact link.",
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="text-fuchsia-500">.IO</span>
          </a>
          <a href="/roadmap" className="text-[11px] opacity-50 hover:opacity-100">
            See what's next →
          </a>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-center tracking-tighter mb-3">Changelog</h1>
        <p className="text-center opacity-50 mb-12">What's shipped recently.</p>

        <div className="flex flex-col gap-8">
          {ENTRIES.map((entry, i) => (
            <div key={i} className="flex gap-5">
              <div className="w-20 shrink-0 pt-0.5 text-[11px] font-bold text-black/30 uppercase tracking-wide">
                {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </div>
              <div className="min-w-0 pb-8 border-b border-black/[0.06] flex-1">
                <h3 className="font-bold text-[15px] mb-1">{entry.title}</h3>
                <p className="text-[13.5px] text-black/55 leading-relaxed">{entry.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="h-16" />
      </div>
    </div>
  );
}
