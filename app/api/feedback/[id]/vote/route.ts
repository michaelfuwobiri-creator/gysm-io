import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Toggles the signed-in user's vote on a feedback item -- identical
// pattern to app/api/roadmap/[id]/vote/route.ts. One vote per user per
// item (primary key (item_id, user_id) in feedback_votes) -- calling this
// again removes the vote instead of stacking duplicates.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
  }

  try {
    const existing = await sql`
      select 1 from feedback_votes where item_id = ${params.id} and user_id = ${user.id}
    `;
    if (existing.length > 0) {
      await sql`delete from feedback_votes where item_id = ${params.id} and user_id = ${user.id}`;
      return NextResponse.json({ voted: false });
    }
    await sql`
      insert into feedback_votes (item_id, user_id) values (${params.id}, ${user.id})
      on conflict (item_id, user_id) do nothing
    `;
    return NextResponse.json({ voted: true });
  } catch (error: any) {
    console.error("[feedback/vote] failed:", error.message);
    return NextResponse.json({ error: "Failed to vote. Please try again." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
