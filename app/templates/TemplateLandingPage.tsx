import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";
import TrackTemplateViewed from "./TrackTemplateViewed";

// Shared renderer for the 4 curated /templates/<slug> landing pages
// (clinic, agency, zodiac, stripe). Each page.tsx just supplies the
// real project id (set via the "Feature as template" toggle in the
// builder -- see app/api/projects/[id]/template) and some copy; this
// pulls the actual generated app html and renders a real, working
// preview + "Open in Builder" link instead of the old fake gray boxes
// and dead button every one of these pages used to have.
type Props = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
};

export default async function TemplateLandingPage({ id, eyebrow, title, description }: Props) {
  // See app/templates/page.tsx for why this is needed -- a plain server
  // component doing a DB read (no cookies/headers call) can otherwise get
  // prerendered once at build time and keep serving that stale shell.
  noStore();
  let html: string | null = null;
  try {
    const rows = await sql`
      select html from projects where id = ${id} and is_template = true limit 1
    `;
    html = (rows[0] as any)?.html ?? null;
  } catch (error: any) {
    console.error(`[templates/${eyebrow}] failed to load:`, error.message);
  }

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] p-8">
      <TrackTemplateViewed id={id} title={title} />
      <Link href="/templates" className="text-black/50 text-sm">
        ← Back to Templates
      </Link>
      <div className="max-w-5xl mx-auto mt-16">
        <div className="inline-flex bg-black/5 px-3 py-1 rounded-full text-xs">TEMPLATE • {eyebrow}</div>
        <h1 className="text-6xl font-black mt-6">{title}</h1>
        <p className="text-black/60 mt-4 text-xl max-w-2xl">{description}</p>
        <Link
          href={html ? `/builder?template=${id}` : "/builder"}
          className="inline-block mt-8 bg-black text-white px-8 py-3 rounded-full font-bold hover:opacity-90 transition"
        >
          Open in Builder →
        </Link>
        <div className="mt-16 bg-white rounded-2xl overflow-hidden border border-black/10 h-[560px] shadow-sm">
          {html ? (
            <iframe
              srcDoc={html}
              className="w-full h-full border-0 pointer-events-none"
              sandbox="allow-scripts allow-same-origin"
              title={title}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-black/40 text-sm">
              Preview unavailable
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
