import { unstable_noStore as noStore } from "next/cache";
import { sql } from "@/lib/db";

// Queries real projects flagged is_template = true in Neon, per
// db/migrations/0001_init.sql.
//
// This page kept showing "No templates published yet" even after real
// rows were flagged is_template=true (verified directly in Neon and via
// a Route Handler running the identical query) -- a Route Handler doing
// the same sql query always saw fresh data, because calling getUser()/
// auth() there reads cookies(), and that alone forces Next out of static
// rendering. This plain page.tsx never touches cookies/headers, so
// despite `dynamic = "force-dynamic"` on the segment, Vercel's build
// still appears to have prerendered it once (with zero templates
// existing at build time) and kept serving that shell. noStore() is the
// documented fix for exactly this case -- a non-fetch data source (the
// Neon client) that still needs to force per-request dynamic rendering.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TemplatesPage() {
  noStore();
  let list: any[] = [];
  try {
    list = await sql`
      select id, prompt, html, created_at from projects
      where is_template = true
      order by created_at desc
      limit 24
    `;
  } catch (error: any) {
    console.error("[templates] failed to load:", error.message);
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Templates</h1>
          <a href="/builder" className="px-4 py-2 bg-white text-black rounded-lg font-semibold">
            Start from scratch
          </a>
        </div>

        {list.length === 0 ? (
          <div className="text-white/50 p-8 border border-dashed border-white/10 rounded-xl text-center">
            No templates published yet.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((t) => (
              <div key={t.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="font-medium line-clamp-2">{t.prompt}</div>
                <div className="bg-white rounded-lg h-[200px] overflow-hidden pointer-events-none">
                  <iframe srcDoc={t.html} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title={t.prompt} />
                </div>
                <a
                  href={`/builder?template=${t.id}`}
                  className="text-center py-2 bg-white text-black rounded-lg text-sm font-semibold"
                >
                  Use this template
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
