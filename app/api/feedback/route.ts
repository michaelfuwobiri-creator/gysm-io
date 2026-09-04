import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// User-submitted feedback board -- the mirror of /api/roadmap (0010):
// there, items are admin-authored and anyone can vote; here, ANY
// signed-in user can post an item (this is literally a "tell us what to
// build" box) and anyone signed in can vote on someone else's. Reading
// the list needs no auth, same as roadmap -- the board itself is public.
export async function GET() {
  try {
    const user = await getUser();
    const userId = user?.id ?? null;
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
    return NextResponse.json({ items: rows });
  } catch (error: any) {
    console.error("[feedback] failed to list items:", error.message);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to post feedback." }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Honeypot (see FeedbackClient.tsx) -- pretend success without
    // writing, same as app/api/marketplace/waitlist/route.ts.
    const honeypot = (body?.website ?? "").toString().trim();
    if (honeypot) {
      return NextResponse.json({ id: "ok" });
    }

    const title = (body?.title ?? "").toString().trim().slice(0, 200);
    const description = (body?.description ?? "").toString().trim().slice(0, 2000) || null;

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    const rows = await sql`
      insert into feedback_items (user_id, title, description, status)
      values (${user.id}, ${title}, ${description}, 'open')
      returning id
    `;
    return NextResponse.json({ id: (rows[0] as any).id });
  } catch (error: any) {
    console.error("[feedback] failed to create item:", error.message);
    return NextResponse.json({ error: "Failed to submit feedback." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
