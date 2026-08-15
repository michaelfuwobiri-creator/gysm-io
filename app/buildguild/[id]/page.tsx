import { sql } from "@/lib/db";
import CommentSection from "./CommentSection";

// Public detail view for one published BuildGuild app: full live preview
// plus the discussion thread (see CommentSection, which talks to
// /api/projects/[id]/comments). Only rows with is_public = true are
// reachable here -- an unpublished project's id returns "not found" even
// if you know it, same as the publish/comments API routes enforce.
export default async function BuildGuildDetailPage({ params }: { params: { id: string } }) {
  let app: {
    id: string;
    title: string | null;
    tagline: string | null;
    publisher_name: string | null;
    published_at: string;
    html: string;
  } | null = null;

  try {
    const rows = await sql`
      select id, title, tagline, publisher_name, published_at, html
      from projects
      where id = ${params.id} and is_public = true
      limit 1
    `;
    app = (rows[0] as any) ?? null;
  } catch (error: any) {
    console.error("[buildguild] failed to load app:", error.message);
  }

  if (!app) {
    return (
      <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-black mb-2">Not on BuildGuild</h1>
          <p className="opacity-50 max-w-sm mx-auto text-[14px]">
            This build hasn't been published, or the link is wrong.
          </p>
          <a href="/buildguild" className="mt-6 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-sm">
            Back to BuildGuild
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }} className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] antialiased">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FCFCF9]/80 border-b border-black/[0.05] h-[56px] md:h-[64px] flex items-center">
        <div className="max-w-[1280px] mx-auto px-5 w-full flex items-center justify-between">
          <a href="/buildguild" className="text-[13px] font-semibold opacity-60 hover:opacity-100">← BuildGuild</a>
          <a href="/builder" className="h-8 md:h-9 px-5 rounded-full bg-black text-white text-[13px] font-semibold grid place-items-center">
            Build your own
          </a>
        </div>
      </nav>

      <div className="max-w-[1280px] mx-auto px-5 py-8 grid lg:grid-cols-[1fr_360px] gap-8">
        <div>
          <div className="rounded-[20px] overflow-hidden border border-black/5 bg-white aspect-video shadow-sm">
            <iframe
              srcDoc={app.html}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0"
              title={app.title || "Published app"}
            />
          </div>

          <div className="mt-6">
            <h1 className="text-[26px] md:text-[32px] font-black tracking-tight">{app.title || "Untitled build"}</h1>
            {app.tagline && <p className="mt-1.5 text-[15px] opacity-60">{app.tagline}</p>}
            <p className="mt-3 text-[12px] opacity-40">
              Published by {app.publisher_name || "a GYSM builder"} on{" "}
              {new Date(app.published_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        <CommentSection projectId={app.id} />
      </div>
    </div>
  );
}
