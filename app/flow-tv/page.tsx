import { listPublicGenerations } from "@/lib/flowTv";
import FlowTvCard from "./FlowTvCard";

// Flow TV / Community Gallery (42-tool spec, layer 2, item 11) -- public
// feed of Media Factory generations users opted to publish (see
// app/api/media/[id]/publish/route.ts). No auth required to browse;
// publishing requires sign-in, enforced in that route, not here -- same
// division of responsibility BuildGuild (app/buildguild) already uses
// for app builds.
export default async function FlowTvPage() {
  let items: Awaited<ReturnType<typeof listPublicGenerations>> = [];
  try {
    items = await listPublicGenerations();
  } catch (error: any) {
    console.error("[flow-tv] failed to load:", error.message);
  }

  return (
    <div
      style={{ fontFamily: "Inter,sans-serif" }}
      className="min-h-screen bg-[#08080a] text-white antialiased selection:bg-[#FF0080] selection:text-white"
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_50%_-10%,rgba(255,0,128,0.16),transparent_60%)]" />

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#08080a]/80 border-b border-white/[0.06] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="font-black tracking-tighter text-[16px]">
              GYSM<span className="text-[#FF0080]">.IO</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/buildguild" className="text-[13px] font-medium text-white/60 hover:text-white hidden md:block mr-2">
              BuildGuild
            </a>
            <a
              href="/builder"
              className="h-8 md:h-9 px-5 rounded-full bg-[#FF0080] text-white text-[13px] font-semibold grid place-items-center hover:bg-[#FF0080]/90 transition-colors"
            >
              Start Building
            </a>
          </div>
        </div>
      </nav>

      <div className="relative max-w-[1280px] mx-auto px-5 pt-10 md:pt-14 pb-28">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold mb-4">
            Media Factory
          </div>
          <h1 className="text-[32px] md:text-[44px] font-black tracking-tight leading-[1.05]">Flow TV</h1>
          <p className="mt-3 text-[15px] text-white/50 leading-relaxed">
            Real Media Factory generations other users published -- every card shows the exact prompt that made it.
            Hit Remix to load that same prompt into your own builder.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 inline-block">
          <div className="text-[20px] font-black">{items.length.toLocaleString()}</div>
          <div className="text-[11px] text-white/40 mt-0.5">Published generations</div>
        </div>

        {items.length === 0 ? (
          <div className="mt-16 text-center text-white/40 text-[14px]">
            Nothing published yet -- generate something in Media Factory, then hit "Publish to Flow TV" on the result.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <FlowTvCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
