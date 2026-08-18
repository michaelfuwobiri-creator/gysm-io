import { sql } from "@/lib/db";
import type { Metadata } from "next";
import ShareButton from "@/app/components/ShareButton";

// Public, no-auth live view of a saved build -- the real implementation of
// what app/publish/page.tsx (no id) has been a placeholder for. Renders
// straight from Neon into a sandboxed iframe, same safe pattern the
// dashboard already uses (never dangerouslySetInnerHTML into the real
// gysm.io origin -- see the removed /publish stub's comment for why that
// mattered).

// Per-app installable PWA: links this build's own manifest (see the
// sibling manifest.webmanifest route) so "Add to Home Screen" installs it
// as its own app -- distinct name/icon -- instead of a GYSM.IO bookmark.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  let title = "GYSM App";
  try {
    const rows = await sql`select title, prompt from projects where id = ${params.id} limit 1`;
    const project = rows[0] as any;
    if (project) title = project.title || project.prompt || title;
  } catch {
    // Non-critical -- fall back to a generic title.
  }

  return {
    title: `${title} — built with GYSM.IO`,
    manifest: `/publish/${params.id}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title },
  };
}

export default async function PublishedProjectPage({
  params,
}: {
  params: { id: string };
}) {
  let project: { id: string; prompt: string; html: string } | null = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(params.id)) {
    try {
      const rows = await sql`
        select id, prompt, html from projects where id = ${params.id} limit 1
      `;
      project = (rows[0] as any) ?? null;
    } catch (error: any) {
      console.error("[publish] failed to load project:", error.message);
    }
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: project.prompt,
            applicationCategory: "LifestyleApplication",
            operatingSystem: "Web",
            description: `${project.prompt} -- built with GYSM.IO.`,
          }),
        }}
      />
      <iframe
        srcDoc={project.html}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full border-0 bg-white"
        title={project.prompt}
      />
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-black text-white/40 text-[11px]">
        <div className="flex items-center gap-2">
          Built with
          <a href="/" className="font-black text-white/70 hover:text-white">
            GYSM<span className="text-fuchsia-500">.IO</span>
          </a>
          — describe an app, get a real one
        </div>
        <ShareButton
          url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/publish/${project.id}`}
          title={project.prompt}
          variant="dark"
          dropUp
        />
      </div>
    </div>
  );
}
