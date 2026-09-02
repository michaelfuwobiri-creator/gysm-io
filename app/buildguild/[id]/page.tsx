import { sql } from "@/lib/db";
import CommentSection from "./CommentSection";
import ShareButton from "@/app/components/ShareButton";
import RemixButton from "./RemixButton";

// Public detail view for one published BuildGuild app: full live preview
// plus the discussion thread (see CommentSection, which talks to
// /api/projects/[id]/comments). Only rows with is_public = true are
// reachable here -- an unpublished project's id returns "not found" even
// if you know it, same as the publish/comments API routes enforce.
//
// Restyled to the same dark/#FF0080 chrome as the redesigned /buildguild
// listing page -- the live-preview iframe and the comment thread keep
// their light cards (that's where the actual content/contrast matters),
// only the surrounding page shell changed.
export default async function BuildGuildDetailPage({ params }: { params: { id: string } }) {
  let app: {
    id: string;
    title: string | null;
    tagline: string | null;
    publisher_name: string | null;
    published_at: string;
    html: string;
    views: number;
    tags: string[];
  } | null = null;

  // Cheap shape check before hitting Postgres -- avoids a "invalid input
  // syntax for type uuid" error-log entry every time a bot/scanner probes
  // this route with a non-UUID path segment (observed in production: stray
  // "%26" hits from crawler noise).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(params.id)) {
    try {
      const rows = await sql`
        select id, title, tagline, publisher_name, published_at, html, views, tags
        from projects
        where id = ${params.id} and is_public = true
        limit 1
      `;
      app = (rows[0] as any) ?? null;
    } catch (error: any) {
      console.error("[buildguild] failed to load app:", error.message);
    }
  }

  if (!app) {
    return (
      <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#08080a] text-white grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-black mb-2">Not on BuildGuild</h1>
          <p className="text-white/50 max-w-sm mx-auto text-[14px]">
            This build hasn't been published, or the link is wrong.
          </p>
          <a href="/buildguild" className="mt-6 inline-block px-5 py-2 bg-[#FF0080] text-white rounded-full font-semibold text-sm">
            Back to BuildGuild
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#08080a] text-white antialiased">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" />

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#08080a]/80 border-b border-white/[0.06] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/buildguild" className="text-[13px] font-semibold text-white/60 hover:text-white">← BuildGuild</a>
          <a href="/builder" className="h-8 md:h-9 px-5 rounded-full bg-[#FF0080] text-white text-[13px] font-semibold grid place-items-center hover:bg-[#FF0080]/90 transition-colors">
            Build your own
          </a>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-5 py-8 grid lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="rounded-[20px] overflow-hidden border border-white/10 bg-white aspect-video shadow-sm">
            <iframe
              srcDoc={app.html}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0"
              title={app.title || "Published app"}
            />
          </div>

          <div className="mt-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px] md:text-[32px] font-black tracking-tight">{app.title || "Untitled build"}</h1>
              {app.tagline && <p className="mt-1.5 text-[15px] text-white/50">{app.tagline}</p>}
              {app.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {app.tags.map((t) => (
                    <a
                      key={t}
                      href={`/buildguild?tag=${encodeURIComponent(t)}`}
                      className="h-6 px-2.5 rounded-full bg-white/[0.06] text-white/50 hover:text-white text-[11px] font-semibold grid place-items-center"
                    >
                      {t}
                    </a>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[12px] text-white/35">
                Published by {app.publisher_name || "a GYSM builder"} on{" "}
                {new Date(app.published_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                {" · "}{app.views || 0} views
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <ShareButton
                url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/buildguild/${app.id}`}
                title={app.title || "A build"}
                variant="dark"
              />
              <RemixButton projectId={app.id} />
            </div>
          </div>
        </div>

        <CommentSection projectId={app.id} />
      </div>
    </div>
  );
}
