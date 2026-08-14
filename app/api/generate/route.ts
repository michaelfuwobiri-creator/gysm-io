import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { CREDIT_COST_PER_BUILD, getCreditBalance, deductCredit } from "@/lib/credits";
import { generateWebsite } from "@/lib/ai/orchestrator";

export async function POST(req: NextRequest) {
  // 1. Auth -- must be signed in. This is the check that was completely
  //    absent before: anyone, logged in or not, could call this route.
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to generate a website.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let prompt = "";
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "Describe what you want to build." }, { status: 400 });
  }

  // 2. Credits -- the actual paywall enforcement. lib/credits.ts is the only
  //    place that reads/writes balances; nothing here trusts the client.
  const balance = await getCreditBalance(user.id);
  if (balance < CREDIT_COST_PER_BUILD) {
    return NextResponse.json(
      { error: "You're out of credits.", code: "NO_CREDITS" },
      { status: 402 }
    );
  }

  // 3. Generate.
  const result = await generateWebsite(prompt);
  if (!result.ok) {
    // Explicit narrowing here (rather than relying on result.ok to narrow
    // the union automatically) because this repo's tsconfig has
    // "strict": false, which turns off strictNullChecks -- and without it,
    // TS doesn't reliably narrow discriminated unions across an if/else.
    // Runtime behavior is identical; this just satisfies the type checker.
    const failure = result as Extract<typeof result, { ok: false }>;
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  // 4. Deduct -- atomic, after a successful generation. If the balance
  //    changed between step 2 and now (a second concurrent request from the
  //    same user, for example) this fails safe and we don't ship a free build.
  const deducted = await deductCredit(user.id);
  if (!deducted) {
    return NextResponse.json(
      { error: "You're out of credits.", code: "NO_CREDITS" },
      { status: 402 }
    );
  }

  // 5. Save. Best-effort: a save failure shouldn't take away a build the
  //    user already paid a credit for, but it is logged loudly so it's caught.
  let projectId: string | null = null;
  try {
    const rows = await sql`
      insert into projects (user_id, prompt, html)
      values (${user.id}, ${prompt}, ${result.html})
      returning id
    `;
    projectId = (rows[0] as any)?.id ?? null;
  } catch (error: any) {
    console.error("[generate] failed to save project:", error.message);
  }

  return NextResponse.json({ html: result.html, projectId });
}

export const dynamic = 'force-dynamic'

