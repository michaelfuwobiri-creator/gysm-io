import { unstable_noStore as noStore } from "next/cache";
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

export default async function TemplatesPage() {
  noStore();
  let list: TemplateCard[] = [];
  try {
    list = (await sql`
      select id, name, prompt, template_blurb as blurb, html, created_at from projects
      where is_template = true
      order by created_at desc
      limit 24
    `) as TemplateCard[];
  } catch (error: any) {
    console.error("[templates] failed to load:", error.message);
  }

  return (
    <AppShell active="templates">
      <TemplatesGallery templates={list} />
    </AppShell>
  );
}
