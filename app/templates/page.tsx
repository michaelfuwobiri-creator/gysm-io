import { unstable_noStore as noStore, unstable_cache } from "next/cache";
import { sql } from "@/lib/db";
import TemplatesGallery from "./TemplatesGallery";
import AppShell from "../components/AppShell";

// Queries real projects flagged is_template = true in Neon, per
// db/migrations/0001_init.sql. Display name comes from the `name` column
// (0004_project_extras.sql, reused rather than duplicated -- see
// app/api/projects/[id]/template/route.ts) and the one-line description
// from `template_blurb` (0008_template_metadata.sql); both are set from
// the builder's "Feature as template" panel and fall back gracefully to
// the raw prompt below if an admin hasn't filled them in yet.
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
// Route/segment rendering mode stays exactly as it was fixed -- do not
// remove dynamic/noStore below to "do ISR" here, it will bring the old
// bug back.
//
// ISR instead happens one layer down: the query result itself (not the
// page) is cached via unstable_cache with a 60s revalidate and the
// "templates" tag, so a fully dynamic route still avoids hitting Neon on
// every request. app/api/projects/[id]/template/route.ts calls
// revalidateTag("templates") right after a successful curation edit, so
// a newly featured/edited template shows up immediately instead of
// waiting out the 60s window -- best of both: cheap by default, instant
// when it matters.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export type TemplateCard = {
  id: string;
  name: string | null;
  prompt: string;
  blurb: string | null;
  html: string;
  created_at: string;
};

const getTemplates = unstable_cache(
  async (): Promise<TemplateCard[]> => {
    return (await sql`
      select id, name, prompt, template_blurb as blurb, html, created_at from projects
      where is_template = true
      order by created_at desc
      limit 24
    `) as TemplateCard[];
  },
  ["templates-gallery"],
  { revalidate: 60, tags: ["templates"] }
);

export default async function TemplatesPage() {
  noStore();
  let list: TemplateCard[] = [];
  try {
    list = await getTemplates();
  } catch (error: any) {
    console.error("[templates] failed to load:", error.message);
  }

  return (
    <AppShell active="templates">
      <TemplatesGallery templates={list} />
    </AppShell>
  );
}
