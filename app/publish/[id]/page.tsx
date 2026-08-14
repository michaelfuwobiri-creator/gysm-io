import { sql } from "@/lib/db";

// Public, no-auth live view of a saved build -- the real implementation of
// what app/publish/page.tsx (no id) has been a placeholder for. Renders
// straight from Neon into a sandboxed iframe, same safe pattern the
// dashboard already uses (never dangerouslySetInnerHTML into the real
// gysm.io origin -- see the removed /publish stub's comment for why that
// mattered).
export default async function PublishedProjectPage({
  params,
}: {
  params: { id: string };
}) {
  let project: { id: string; prompt: string; html: string } | null = null;

  try {
    const rows = await sql`
      select id, prompt, html from projects where id = ${params.id} limit 1
    `;
    project = (rows[0] as any) ?? null;
  } catch (error: any) {
    console.error("[publish] failed to load project:", error.message);
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black text-white grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Build not found</h1>
          <p className="text-white/50 max-w-sm mx-auto">
            This link doesn't match a saved build. It may have been removed, or the link is wrong.
          </p>
          <a
            href="/builder"
            className="mt-6 inline-block px-5 py-2 bg-white text-black rounded-full font-semibold text-sm"
          >
            Go to builder
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <iframe
        srcDoc={project.html}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full border-0 bg-white"
        title={project.prompt}
      />
      <div className="shrink-0 flex items-center justify-center gap-2 py-2 bg-black text-white/40 text-[11px]">
        Built with
        <a href="/" className="font-black text-white/70 hover:text-white">
          GYSM<span className="opacity-50">.IO</span>
        </a>
        — describe an app, get a real one
      </div>
    </div>
  );
}
