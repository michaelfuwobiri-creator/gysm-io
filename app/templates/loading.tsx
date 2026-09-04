// App Router route-level loading state for /templates -- shown while the
// page's own async work (AppShell's getUser()/getCreditBalance() and the
// Neon templates query in page.tsx) is in flight. Mirrors
// TemplatesGallery's real layout (page background, heading block, card
// grid) with pulsing placeholders instead of the actual sidebar/data, so
// there's no layout jump when the real content swaps in a moment later.
export default function TemplatesLoading() {
  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.06),transparent_60%)]" />
      <div className="max-w-6xl mx-auto relative">
        <div className="mb-6">
          <div className="h-8 w-40 rounded-lg bg-black/5 animate-pulse" />
          <div className="mt-2 h-4 w-72 rounded bg-black/5 animate-pulse" />
        </div>
        <div className="mb-6 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-black/5 animate-pulse" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-black/5 bg-white overflow-hidden flex flex-col shadow-sm">
              <div className="h-[170px] bg-black/5 animate-pulse" />
              <div className="p-4 flex flex-col gap-2">
                <div className="h-4 w-3/4 rounded bg-black/5 animate-pulse" />
                <div className="h-3 w-full rounded bg-black/5 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-black/5 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
