import type { Metadata } from "next";
import { sql } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import FeedbackClient from "./FeedbackClient";

export const metadata: Metadata = {
  title: "Feedback | GYSM.IO",
  description: "Tell us what to build next on GYSM.IO -- post an idea, upvote what you want most.",
};
export const dynamic = "force-dynamic";

// Public feedback board -- the user-authored counterpart to /roadmap
// (which is admin-authored). Anyone signed in can post an idea; anyone
// signed in can upvote; Mike triages status/removes spam. See
// db/migrations/0023_feedback.sql for why this is a separate table from
// roadmap_items rather than reusing it.
export default async function FeedbackPage() {
  const user = await getUser();
  const userId = user?.id ?? null;

  let items: any[] = [];
  try {
    const rows = await sql`
      select
        f.id, f.title, f.description, f.status, f.created_at, f.user_id,
        count(v.user_id)::int as votes,
        coalesce(bool_or(v.user_id = ${userId}), false) as voted
      from feedback_items f
      left join feedback_votes v on v.item_id = f.id
      group by f.id
      order by votes desc, f.created_at desc
    `;
    items = rows as any[];
  } catch (error: any) {
    console.error("[feedback] page failed to load items:", error.message);
  }

  const isAdmin = isAdminEmail(user?.email ?? null);

  return (
    <div className="min-h-screen bg-[#FCFCF9] text-[#0A0A0A]">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex justify-between items-center py-4 border-b border-black/10 mb-10">
          <a href="/" className="text-2xl font-black">
            GYSM<span className="text-[#FF0080]">.IO</span>
          </a>
          <a href="/dashboard" className="text-[11px] opacity-50 hover:opacity-100">
            Back to dashboard
          </a>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-center tracking-tighter mb-3">Feedback</h1>
        <p className="text-center opacity-50 mb-12">
          Tell us what to build. Real ideas from real users -- vote on what you want most.{" "}
          <a href="/roadmap" className="underline">See the roadmap →</a>
        </p>

        <FeedbackClient initialItems={items} signedIn={!!user} isAdmin={isAdmin} currentUserId={userId} />

        <div className="h-16" />
      </div>
    </div>
  );
}
