// Curated founder-run showcase -- moved here from the homepage (which used
// to end in a long scroll of marketing sections; Mike asked to cut the
// homepage down to just the hero + "See what's been built" CTA, which now
// links straight here, and fold this grid into BuildGuild instead of
// deleting it).
//
// These are real apps published to BuildGuild by GYSM's own founder while
// testing the platform (verified live at /publish/[id] as of writing), not
// placeholder tiles -- pinned above the open community grid below so a
// first-time visitor sees a few polished, finished builds before the
// unfiltered community feed. Each `AppLogo` case recreates that app's
// actual generated icon (shape + color), not a generic glyph.
const APPS = [
  { name: "orbit.", tag: "Live", projectId: "5b983815-8702-4bde-b4d6-712ae95d95c0", desc: "Zodiac dating app" },
  { name: "Studio Sol", tag: "Live", projectId: "2f736c3e-f255-4ec2-80f6-60dac7d3afd3", desc: "Salon booking" },
  { name: "loop.", tag: "Live", projectId: "7ce589a2-76aa-4a38-98c4-a915423d347c", desc: "Habit tracker" },
  { name: "VelocityRun", tag: "Live", projectId: "01d17652-6489-42d2-bfdf-61e12810e285", desc: "Racing game" },
];

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

export default function FeaturedApps() {
  return (
    <div className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/30">Featured</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {APPS.map((app) => (
          <a
            key={app.name}
            href={`/publish/${app.projectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-[20px] bg-white/[0.04] border border-white/10 p-3 md:p-4 hover:border-[#FF0080]/40 hover:bg-white/[0.06] transition-all"
          >
            <div className="relative h-[88px] md:h-[110px] rounded-[14px] bg-[#0e0e11] border border-white/10 grid place-items-center overflow-hidden">
              <AppLogo name={app.name} className="h-11 w-11 md:h-14 md:w-14 transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-white/10 border border-white/10 grid place-items-center text-[12px] text-white opacity-0 group-hover:opacity-100 transition-opacity">↗</div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-bold">{app.name}</div>
                <div className="text-[11px] text-white/40 mt-0.5">{app.desc}</div>
              </div>
              <div className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#FF0080] text-white shrink-0">{app.tag}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
