// Shared chrome for GYSM.IO's own legal/support pages (Privacy, Terms, Support).
// Matches the main site's header style so these feel like part of gysm.io,
// not a bolted-on legal template.
import CookiePreferencesLink from "@/app/components/CookiePreferencesLink";
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FDFCF5] text-[#0A0A0A] antialiased">
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFCF5]/80 border-b border-black/[0.06] h-[64px] flex items-center">
        <div className="max-w-[720px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-black grid place-items-center text-white text-[13px] font-black">G</div>
            <span className="font-black tracking-tight text-[15px]">GYSM<span className="text-fuchsia-500">.IO</span></span>
          </a>
          <a href="/" className="text-[12px] font-semibold opacity-50 hover:opacity-100">Back to gysm.io</a>
        </div>
      </nav>
      <div className="max-w-[720px] mx-auto px-5 py-14">{children}</div>
      <div className="max-w-[720px] mx-auto px-5 pb-14 -mt-8 text-[12px] font-semibold">
        <CookiePreferencesLink className="underline opacity-50 hover:opacity-100" />
      </div>
    </div>
  );
}
