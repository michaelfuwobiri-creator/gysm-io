import { supabaseAdmin } from "@/lib/supabase";

// Previously /api/templates returned a hardcoded 3-item array (clinic/food/ride)
// that didn't even match the slugs of the actual template pages in this folder
// (agency/clinic/stripe/zodiac) -- and no page anywhere rendered that array,
// so it had no way to reach a user. This queries real projects flagged
// is_template = true in Supabase, per the migration in supabase/migrations.
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const { data: templates, error } = await supabaseAdmin
    .from("projects")
    .select("id, prompt, html, created_at")
    .eq("is_template", true)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.error("[templates] failed to load:", error.message);
  }

  const list = templates ?? [];

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
