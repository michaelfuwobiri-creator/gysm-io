import Link from "next/link";
import { sql } from "@/lib/db";

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
    <div className="min-h-screen bg-black text-white p-8">
      <Link href="/templates" className="text-white/50 text-sm">
        ← Back to Templates
      </Link>
      <div className="max-w-5xl mx-auto mt-16">
        <div className="inline-flex bg-white/10 px-3 py-1 rounded-full text-xs">TEMPLATE • {eyebrow}</div>
        <h1 className="text-6xl font-black mt-6">{title}</h1>
        <p className="text-white/60 mt-4 text-xl max-w-2xl">{description}</p>
        <Link
          href={html ? `/builder?template=${id}` : "/builder"}
          className="inline-block mt-8 bg-white text-black px-8 py-3 rounded-full font-bold"
        >
          Open in Builder →
        </Link>
        <div className="mt-16 bg-white rounded-2xl overflow-hidden border border-white/10 h-[560px]">
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
