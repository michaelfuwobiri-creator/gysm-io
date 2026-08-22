// Template discovery strip shown right on the dashboard, above the
// user's own builds -- previously the only way to see a template was to
// leave the dashboard entirely via the sidebar's "Templates" link. This
// surfaces a handful of real, curated templates (same is_template=true
// rows /templates uses -- see app/templates/page.tsx) inline, with a
// "Browse all" link to the full gallery for everything else. Uses
// GYSM's light card styling -- same as the public homepage -- rather
// than introducing a new visual pattern.
export type TemplateStripItem = {
  id: string;
  name: string | null;
  prompt: string;
  blurb: string | null;
  html: string;
};

export default function TemplatesStrip({ templates }: { templates: TemplateStripItem[] }) {
  if (templates.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-black/40 uppercase tracking-wider">Start from a template</h2>
        <a href="/templates" className="text-[13px] font-bold text-fuchsia-600 hover:text-fuchsia-700 shrink-0">
          Browse all →
        </a>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 scrollbar-none">
        {templates.map((t) => {
          const title = t.name || t.prompt.slice(0, 60);
          const description = t.blurb || t.prompt;
          return (
            <a
              key={t.id}
              href={`/builder?template=${t.id}`}
              className="group w-[220px] shrink-0 rounded-2xl border border-black/5 bg-white overflow-hidden flex flex-col shadow-sm transition hover:border-fuchsia-500/30 hover:shadow-md"
            >
              <div className="relative h-[120px] bg-white overflow-hidden pointer-events-none border-b border-black/5">
                <div
                  style={{
                    width: "166.7%",
                    height: "166.7%",
                    transform: "scale(0.6)",
                    transformOrigin: "top left",
                  }}
                >
                  <iframe
                    srcDoc={t.html}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title={title}
                    tabIndex={-1}
                  />
                </div>
              </div>
              <div className="p-3 flex flex-col gap-1">
                <div className="font-bold text-[13px] text-black line-clamp-1">{title}</div>
                <div className="text-black/45 text-[12px] line-clamp-2">{description}</div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
