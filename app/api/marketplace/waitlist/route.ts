import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

// Public (no sign-in required) waitlist capture for the coming-soon domain
// marketplace. Intentionally does NOT process any payment or reserve a
// domain -- there's no real checkout yet, so this only records interest.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const domainInterest = typeof body?.domain === "string" ? body.domain.trim().slice(0, 120) : null;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    await sql`
      insert into marketplace_waitlist (email, domain_interest)
      values (${email}, ${domainInterest})
      on conflict (email) do update set domain_interest = coalesce(excluded.domain_interest, marketplace_waitlist.domain_interest)
    `;

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[marketplace] failed to save waitlist signup:", error.message);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
