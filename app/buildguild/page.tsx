import { sql } from "@/lib/db";
import { toThumbnailHtml } from "@/lib/thumbnailHtml";

// BuildGuild -- public gallery of every app users have opted to publish
// (projects.is_public = true, set via POST /api/projects/[id]/publish).
// No auth required to browse; publishing and commenting require sign-in
// (enforced in their respective API routes, not here).
export default async function BuildGuildPage() {
  let apps: {
    id: string;
    title: string | null;
    tagline: string | null;
    publisher_name: string | null;
    published_at: string;
    html: string;
  }[] = [];

  try {
    apps = (await sql`
      select id, title, tagline, publisher_name, published_at, html
      from projects
      where is_public = true
      order by published_at desc
      limit 60
    `) as any;
  } catch (error: any) {
    console.error("[buildguild] failed to load published apps:", error.message);
  }

  return (
    <div
      style={{ fontFamily: "Inter,sans-serif" }}
      className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased selection:bg-[#FF0080] selection:text-white"
    >
      {/* A <link> tag, not an inline <style>@import> -- React HTML-escapes
          text content (the apostrophes here become &#x27;), and CSS's
          @import doesn't decode HTML entities, so the old <style> version
          was literally fetching a broken URL (".../&#x27;https://fonts...")
          and silently falling back to system fonts on every load. A
          link's href attribute is properly entity-decoded by the HTML
          parser, so this actually loads the font. */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="font-black tracking-tighter text-[16px]">GYSM<span className="text-[#FF0080]">.IO</span></span>
          </a>
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Dashboard</a>
            <a href="/builder" className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">
              Start Building
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-5 pt-12 md:pt-16 pb-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold shadow-sm mb-4">
            Community showcase
          </div>
          <h1 className="text-[32px] md:text-[44px] font-black tracking-tight leading-[1.05]">BuildGuild</h1>
          <p className="mt-3 text-[15px] opacity-60 leading-relaxed">
            Real apps other builders shipped with GYSM — live, clickable, and open for feedback. Publish your own from
            the builder or your dashboard, and drop a comment on anything that catches your eye.
          </p>
        </div>

        {apps.length === 0 ? (
          <div className="mt-12 rounded-[20px] border border-dashed border-black/10 bg-white p-10 text-center">
            <p className="font-bold">Nothing published yet</p>
            <p className="text-[13px] opacity-50 mt-1 max-w-sm mx-auto">
              Be the first — finish a build, then hit "Share to BuildGuild" to put it here.
            </p>
            <a href="/builder" className="mt-5 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-[13px]">
              Go to builder
            </a>
          </div>
        ) : (
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <a
                key={app.id}
                href={`/buildguild/${app.id}`}
                className="group rounded-[20px] bg-white border border-black/5 overflow-hidden hover:shadow-lg transition flex flex-col"
              >
                <div className="h-[160px] bg-[#FCFCF9] pointer-events-none overflow-hidden border-b border-black/5">
                  <iframe
                    srcDoc={toThumbnailHtml(app.html)}
                    className="w-full h-full border-0 scale-100"
                    sandbox="allow-scripts allow-same-origin"
                    title={app.title || "Published app"}
                    tabIndex={-1}
                    scrolling="no"
                  />
                </div>
                <div className="p-4 flex flex-col gap-1.5">
                  <div className="font-bold text-[14px] line-clamp-1">{app.title || "Untitled build"}</div>
                  {app.tagline && <div className="text-[12px] opacity-60 line-clamp-2">{app.tagline}</div>}
                  <div className="text-[11px] opacity-40 mt-1">
                    by {app.publisher_name || "a GYSM builder"} ·{" "}
                    {new Date(app.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
