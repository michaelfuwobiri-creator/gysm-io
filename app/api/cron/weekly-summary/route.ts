import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { sendWeeklySummaryEmail } from "@/lib/email/send";

// Vercel Cron hits this on a schedule (see vercel.json) -- same
// Authorization: Bearer ${CRON_SECRET} pattern as
// app/api/voiie/cron/hunt/route.ts and app/api/voiie/cron/renewals/route.ts.
//
// One aggregated query rather than one query per user: builds-this-week
// and credits-remaining are both computed in SQL (left joins, so a user
// with zero builds or no credits row at all still gets a row with 0s,
// not skipped) and every user with an email gets an email -- see
// GYSM_IO_HANDOFF.md item #7's "Weekly build summary" line. Each send
// already swallows and logs its own error (lib/email/send.tsx), so one
// bad address can't fail the whole sweep; sendWeeklySummaryEmail calls
// are still wrapped per-user here so a thrown error (not just a caught
// one) can't stop the loop partway through either.
//
// Scaling note, flagged rather than silently ignored: this sends
// synchronously in one function invocation. Fine at GYSM's current user
// count; if that grows into the thousands, this needs batching/paging
// and likely a queue (e.g. chunked cron calls or a background job)
// instead of one straight loop against a single maxDuration budget.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await sql`
      select
        u.clerk_id as user_id,
        u.email,
        u.name,
        coalesce(c.balance, 0) as credits_remaining,
        coalesce(w.builds_this_week, 0) as builds_this_week
      from users u
      left join credits c on c.user_id = u.clerk_id
      left join (
        select user_id, count(*)::int as builds_this_week
        from projects
        where created_at > now() - interval '7 days' and is_template = false
        group by user_id
      ) w on w.user_id = u.clerk_id
      where u.email is not null
    `;

    let sent = 0;
    for (const row of rows as any[]) {
      try {
        await sendWeeklySummaryEmail(row.email, row.name, row.builds_this_week, row.credits_remaining);
        sent++;
      } catch (error: any) {
        console.error(`[cron/weekly-summary] failed to send to ${row.user_id}:`, error.message);
      }
    }

    return Response.json({ ok: true, sent, total: (rows as any[]).length });
  } catch (error: any) {
    console.error("[cron/weekly-summary] sweep failed:", error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// 240 is the ceiling already used elsewhere in this app (app/api/generate,
// app/api/v1/generate, app/api/voiie/demo/[id]) -- matching it rather than
// guessing a higher number this account's plan may not actually allow.
export const maxDuration = 240;
export const dynamic = "force-dynamic";
