// Shared chrome for Orbit's legal/support pages (Privacy, Terms, Support).
// These exist primarily to satisfy App Store Connect / Play Console's
// required-URL fields for the Orbit app store listing, and are written to
// honestly reflect what Orbit currently is: a live product preview built
// on GYSM.IO with no real accounts or backend yet, not a fictional legal
// document pretending otherwise.
export default function OrbitLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ fontFamily: "Inter,sans-serif" }}
      className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased"
    >
      {/* A <link> tag, not an inline <style>@import> -- React HTML-escapes
          text content (the apostrophes here become &#x27;), and CSS's
          @import doesn't decode HTML entities, so the old <style> version
          was literally fetching a broken URL (".../&#x27;https://fonts...")
          and silently falling back to system fonts on every load. A
          link's href attribute is properly entity-decoded by the HTML
          parser, so this actually loads the font. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] flex items-center">
        <div className="max-w-[720px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/publish/5b983815-8702-4bde-b4d6-712ae95d95c0" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center text-white text-[13px]">✦</div>
            <span className="font-black tracking-tight text-[15px]">orbit.</span>
          </a>
          <a href="/" className="text-[12px] font-medium opacity-50 hover:opacity-100">Built with GYSM.IO</a>
        </div>
      </nav>
      <div className="max-w-[720px] mx-auto px-5 py-12">{children}</div>
    </div>
  );
}
