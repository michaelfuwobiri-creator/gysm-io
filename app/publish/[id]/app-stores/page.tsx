import { sql } from "@/lib/db";
import type { Metadata } from "next";
import AppStoreGuide from "@/app/components/AppStoreGuide";

// Publish-to-app-stores checklist for one specific build. Sits alongside
// app/publish/[id]/page.tsx (the live web view) -- same project lookup
// pattern, but instead of rendering the build it renders the requirements
// walkthrough for shipping that build to the App Store / Play Store.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getProject(id: string) {
  if (!UUID_RE.test(id)) return null;
  try {
    const rows = await sql`select id, prompt, title from projects where id = ${id} limit 1`;
    return (rows[0] as any) ?? null;
  } catch (error: any) {
    console.error("[publish/app-stores] failed to load project:", error.message);
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const project = await getProject(params.id);
  const name = project?.title || project?.prompt?.slice(0, 60) || "your build";
  return {
    title: `Publish ${name} to the App Store & Play Store — GYSM.IO`,
    robots: { index: false },
  };
}

export default async function AppStoresPage({ params }: { params: { id: string } }) {
  const project = await getProject(params.id);

  if (!project) {
    return (
      <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A] grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Build not found</h1>
          <p className="text-black/50 max-w-sm mx-auto">
            This link doesn't match a saved build. It may have been removed, or the link is wrong.
          </p>
          <a href="/builder" className="mt-6 inline-block px-5 py-2 bg-black text-white rounded-full font-semibold text-sm hover:opacity-90 transition">
            Go to builder
          </a>
        </div>
      </div>
    );
  }

  const appName = project.title || project.prompt?.slice(0, 60) || "Your app";

  return <AppStoreGuide projectId={project.id} appName={appName} />;
}
