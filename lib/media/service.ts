import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { deductCredit, addCredits } from "@/lib/credits";
import { MEDIA_CREDIT_COST, MEDIA_KIND_ENV_VAR, type MediaKind } from "@/lib/mediaCreditsConstants";
import { sendBuildFailedEmail } from "@/lib/email/send";

// Shared plumbing every /api/media/* route uses -- auth, the "is this
// provider even configured yet" gate, atomic credit deduction (mirrors
// deductCredit's existing use for builds in lib/credits.ts), and the
// media_generations row lifecycle (pending -> processing/done|failed).
// Centralized here so each route file is just "call the provider",
// not a re-implementation of credit handling per capability.

export type MediaUser = { id: string; email: string | null; name: string | null };

export async function requireUserAndCredit(
  kind: MediaKind
): Promise<{ ok: true; user: MediaUser; cost: number } | { ok: false; status: number; error: string }> {
  const user = await getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Sign in to use Media Factory." };
  }
  const envVar = MEDIA_KIND_ENV_VAR[kind];
  if (!process.env[envVar]) {
    return {
      ok: false,
      status: 501,
      error: `${kind} generation isn't connected yet (${envVar} is not configured). This capability is built but waiting on a real provider API key.`,
    };
  }
  const cost = MEDIA_CREDIT_COST[kind];
  const deducted = await deductCredit(user.id, cost);
  if (!deducted) {
    return { ok: false, status: 402, error: `Not enough credits -- this costs ${cost}.` };
  }
  return { ok: true, user, cost };
}

export async function insertGeneration(params: {
  userId: string;
  kind: MediaKind;
  provider: string;
  cost: number;
  input: Record<string, unknown>;
}): Promise<string> {
  const rows = await sql`
    insert into media_generations (user_id, kind, provider, credit_cost, input, status)
    values (${params.userId}, ${params.kind}, ${params.provider}, ${params.cost}, ${JSON.stringify(params.input)}::jsonb, 'pending')
    returning id
  `;
  return (rows[0] as any).id as string;
}

export async function markDone(id: string, outputUrl: string): Promise<void> {
  await sql`update media_generations set status = 'done', output_url = ${outputUrl}, updated_at = now() where id = ${id}`;
}

export async function markProcessing(id: string, providerJobId: string): Promise<void> {
  await sql`update media_generations set status = 'processing', provider_job_id = ${providerJobId}, updated_at = now() where id = ${id}`;
}

// Refunds the deducted credit alongside marking the row failed -- a
// failed generation shouldn't cost the user anything, same principle as
// not charging for a build that errors out before it produces an app.
// Also sends the "build failed" email (item #7) -- media generations
// (video, voice, etc.) are the async, walk-away-and-come-back kind, so
// an email actually adds value here, unlike the main prompt-driven
// builder chat, which already shows a failure inline in the same open
// tab instantly (see BuildFailedEmail.tsx's header comment). Takes the
// full user object (not just the id) since every call site already has
// it from requireUserAndCredit() -- one extra DB round-trip per failure
// to look up an email nobody asked for isn't worth it when the caller
// already has it in scope.
export async function markFailed(id: string, user: MediaUser, cost: number, kind: string, error: string): Promise<void> {
  await Promise.all([
    sql`update media_generations set status = 'failed', error = ${error}, updated_at = now() where id = ${id}`,
    addCredits(user.id, cost),
  ]);
  if (user.email) await sendBuildFailedEmail(user.email, user.name, kind, error);
}
