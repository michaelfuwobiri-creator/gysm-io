import CookiePreferencesLink from "../components/CookiePreferencesLink";

// Full site directory -- the Product/Account/Company link columns that used
// to live in the homepage footer. Mike asked to declutter the homepage
// footer down to just the brand block, move these three columns to their
// own page, and deliberately NOT add this page to the header nav (it's a
// reference page, not a primary nav destination) -- the homepage footer
// links here instead (see app/[locale]/page.tsx's footer).
export const metadata = {
  title: "Site Links | GYSM.IO",
  description: "Every page on GYSM.IO in one place.",
};

const SECTIONS = [
  {
    title: "Product",
    links: [
      { href: "/templates", label: "Templates" },
      { href: "/connectors", label: "Connectors" },
      { href: "/marketplace", label: "Marketplace" },
      { href: "/buildguild", label: "BuildGuild" },
      { href: "/actlayer", label: "ActLayer" },
      { href: "/media-factory-preview.html", label: "Media Factory (preview)" },
      { href: "/pricing", label: "Pricing" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/sign-in", label: "Log in" },
      { href: "/sign-up", label: "Sign up" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "mailto:support@gysm.io?subject=Work%20with%20us", label: "Work with us" },
      { href: "/support", label: "Support" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
] as const;

export default function LinksPage() {
  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="font-black tracking-tighter text-[16px]">GYSM<span className="text-[#FF0080]">.IO</span></a>
          <a href="/" className="text-[13px] font-medium opacity-60 hover:opacity-100">Back to home</a>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-5 md:px-8 py-14 md:py-20">
        <h1 className="text-[28px] md:text-[40px] font-black tracking-[-0.03em] leading-[0.9]">Site links</h1>
        <p className="mt-3 text-[14px] opacity-60 max-w-[480px]">Every page on GYSM.IO, in one place.</p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-10">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="text-[11px] font-black tracking-[0.1em] uppercase text-black/30 mb-3">{section.title}</div>
              <ul className="flex flex-col gap-2.5 text-[14px] font-bold">
                {section.links.map((link) => (
                  <li key={link.href}><a href={link.href} className="text-black/80 hover:text-black">{link.label}</a></li>
                ))}
                {section.title === "Company" && <li><CookiePreferencesLink /></li>}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-black/[0.06] text-[11px] text-black/30">© 2026 GYSM<span className="text-[#FF0080]">.IO</span> — built for founders who ship</div>
      </div>
    </div>
  );
}
