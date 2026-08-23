import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import RoadmapClient from "./RoadmapClient";
import RoadmapAdminForm from "./RoadmapAdminForm";

export const metadata: Metadata = {
  title: "Roadmap | GYSM.IO",
  description: "What's planned, in progress, and shipped on GYSM.IO -- vote on what you want built next.",
};
export const dynamic = "force-dynamic";

// Public roadmap board. Same real-request pattern as /connectors, applied
// site-wide instead of just to connectors: real admin-authored items,
// real votes, no fabricated "coming soon" list.
export default async function RoadmapPage() {
  const user = await getUser();
  const userId = user?.id ?? null;

  let items: any[] = [];
  try {
    const rows = await sql`
      select
        r.id, r.title, r.description, r.status, r.created_at,
        count(v.user_id)::int as votes,
        coalesce(bool_or(v.user_id = ${userId}), false) as voted
      from roadmap_items r
      left join roadmap_votes v on v.item_id = r.id
      group by r.id
      order by votes desc, r.created_at desc
    `;
    items = rows as any[];
  } catch (error: any) {
    console.error("[roadmap] page failed to load items:", error.message);
  }

  const isAdmin = isAdminEmail(user?.email ?? null);

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="text-fuchsia-500">.IO</span>
          </a>
          <a href="/dashboard" className="text-[11px] opacity-50 hover:opacity-100">
            Back to dashboard
          </a>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-center tracking-tighter mb-3">Roadmap</h1>
        <p className="text-center opacity-50 mb-12">Vote on what we build next. Real requests, no fake "coming soon."</p>

        {isAdmin && <RoadmapAdminForm />}

        <RoadmapClient initialItems={items} signedIn={!!user} isAdmin={isAdmin} />

        <div className="h-16" />
      </div>
    </div>
  );
}
