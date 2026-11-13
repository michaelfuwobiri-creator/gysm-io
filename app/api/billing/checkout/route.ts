import { NextRequest, NextResponse } from "next/server";
import { createPlanCheckout } from "@/lib/billing/checkout";
import { getUser } from "@/lib/auth";

// This route did not exist at all in the repo -- app/pricing/page.tsx was
// already calling POST /api/billing/checkout, and two throwaway scripts
// (fix.js, fix2.js) show it was written locally at some point, but no real
// route.ts ever made it into the committed app/api/billing/ directory.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before upgrading.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let planId: string;
  try {
    const body = await req.json();
    planId = (body?.planId ?? body?.plan ?? "").toString();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const r = await createPlanCheckout({ id: user.id, email: user.email }, planId);
  return "error" in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json({ url: r.url });
}

export const dynamic = 'force-dynamic'

