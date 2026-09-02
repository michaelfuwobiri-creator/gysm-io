import { sql } from "@/lib/db";
import { headers } from "next/headers";
import { injectAiGeneratedMeta } from "@/lib/aiDisclosure";
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
  let tagline: string | null = null;
  try {
    const rows = await sql`select title, tagline, prompt from projects where id = ${params.id} limit 1`;
    const project = rows[0] as any;
    if (project) {
      title = project.title || project.prompt || title;
      tagline = project.tagline || null;
    }
  } catch {
    // Non-critical -- fall back to a generic title.
  }

  // Reuses the same title/tagline BuildGuild publishing already collects
  // (see app/api/projects/[id]/publish/route.ts) as this page's SEO
  // description and Open Graph/Twitter card, so a shared link to any
  // published build looks right in Slack/iMessage/Twitter previews
  // instead of falling back to generic site-wide copy.
  const description = tagline || `${title} -- an app built with GYSM.IO. Describe an app, get a real one.`;
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/publish/${params.id}`;

  return {
    title: `${title} — built with GYSM.IO`,
    description,
    manifest: `/publish/${params.id}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title },
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — built with GYSM.IO`,
      description,
      url,
      siteName: "GYSM.IO",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — built with GYSM.IO`,
      description,
    },
  };
}

export default async function PublishedProjectPage({
  params,
}: {
  params: { id: string };
}) {
  let project: { id: string; prompt: string; html: string; check_status: string | null } | null = null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(params.id)) {
    try {
      const rows = await sql`
        select id, prompt, html, check_status from projects where id = ${params.id} limit 1
      `;
      project = (rows[0] as any) ?? null;
      // Best-effort view count -- fire-and-forget, never blocks or fails
      // the page render. Simple per-load counter, not deduped per visitor;
      // good enough to show "this build gets traffic" on the dashboard
      // without standing up a real analytics pipeline.
      if (project) {
        sql`update projects set views = views + 1 where id = ${params.id}`.catch((error: any) => {
          console.error("[publish] failed to bump view count:", error.message);
        });
        // Richer signal alongside the plain counter above -- one row per
        // view with when it happened and where it came from, so
        // /dashboard/analytics can show a real trend and top referrers
        // instead of just a lifetime total. Same fire-and-forget posture:
        // never blocks or fails the page render.
        const referrer = headers().get("referer") || null;
        sql`insert into project_view_events (project_id, referrer) values (${params.id}, ${referrer})`.catch((error: any) => {
          console.error("[publish] failed to log view event:", error.message);
        });
      }
    } catch (error: any) {
      console.error("[publish] failed to load project:", error.message);
    }
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Build not found</h1>
          <p className="text-black/50 max-w-sm mx-auto">
            This link doesn't match a saved build. It may have been removed, or the link is wrong.
          </p>
          <a
            href="/builder"
            className="mt-6 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:opacity-90 transition"
          >
            Go to builder
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
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
        srcDoc={injectAiGeneratedMeta(project.html)}
        sandbox="allow-scripts allow-same-origin"
        className="flex-1 w-full border-0 bg-white"
        title={project.prompt}
      />
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-white border-t border-black/10 text-black/40 text-[11px]">
        <div
          className="flex items-center gap-2"
          title="This app was generated by artificial intelligence from a text prompt, using GYSM.IO."
        >
          <span aria-hidden className="opacity-60">✦</span>
          AI-generated with
          <a href="/" className="font-black text-black/70 hover:text-black">
            GYSM<span className="text-[#FF0080]">.IO</span>
          </a>
          — describe an app, get a real one
        </div>
        {project.check_status === "pass" && (
          <span
            title="Passed GYSM.IO's automated pre-publish check -- no broken internal links, no unclosed tags, no leftover placeholder text."
            className="hidden sm:inline-flex items-center gap-1 text-emerald-600/70 shrink-0"
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
            Checked
          </span>
        )}
        <ShareButton
          url={`${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/publish/${project.id}`}
          title={project.prompt}
          variant="light"
          dropUp
        />
      </div>
    </div>
  );
}
