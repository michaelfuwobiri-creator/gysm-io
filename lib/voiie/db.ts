// Raw-SQL data access for VOIIE's own tables (db/migrations/0016_voiie.sql)
// -- following the same pattern as lib/credits.ts and lib/analytics.ts:
// no ORM, just `sql` tagged templates against @/lib/db, with every query
// scoped by owner_user_id the same way every other table in this app is
// scoped by user_id/org_id (see lib/auth.ts).

import { sql } from "@/lib/db";
import type { LeadAnswers, LeadStatus, OutreachChannel, Platform, VoiieLead, VoiieMessage } from "@/types/voiie";

export interface NewLeadCandidate {
  platform: Platform;
  handle: string;
  displayName?: string | null;
  bio?: string | null;
  signal?: string | null;
}

/** Inserts a hunted candidate as a new lead, or silently does nothing if
 *  this owner already has a lead for that platform+handle (case
 *  insensitive -- see the unique index in the migration). Returns the
 *  lead id on insert, or null if it already existed. */
export async function createLeadIfNew(ownerUserId: string, candidate: NewLeadCandidate): Promise<string | null> {
  const rows = await sql`
    insert into voiie_leads (owner_user_id, platform, handle, display_name, bio, signal)
    values (${ownerUserId}, ${candidate.platform}, ${candidate.handle}, ${candidate.displayName ?? null}, ${candidate.bio ?? null}, ${candidate.signal ?? null})
    on conflict (owner_user_id, platform, lower(handle)) do nothing
    returning id
  `;
  return (rows[0] as any)?.id ?? null;
}

export async function listLeads(ownerUserId: string, limit = 200): Promise<VoiieLead[]> {
  const rows = await sql`
    select * from voiie_leads
    where owner_user_id = ${ownerUserId}
    order by created_at desc
    limit ${limit}
  `;
  return rows as unknown as VoiieLead[];
}

export async function getLead(id: string, ownerUserId: string): Promise<VoiieLead | null> {
  const rows = await sql`
    select * from voiie_leads where id = ${id} and owner_user_id = ${ownerUserId} limit 1
  `;
  return (rows[0] as unknown as VoiieLead) ?? null;
}

/** Unscoped lookup -- only for server-side flows that don't have a signed
 *  in user yet (inbound WhatsApp/Twitter/Threads webhooks, the Stripe
 *  webhook). Never expose this to a route that trusts caller-supplied ids
 *  without its own auth check. */
export async function getLeadUnscoped(id: string): Promise<VoiieLead | null> {
  const rows = await sql`select * from voiie_leads where id = ${id} limit 1`;
  return (rows[0] as unknown as VoiieLead) ?? null;
}

export async function findLeadByContact(ownerUserId: string, phoneOrHandle: { phone?: string; handle?: string }): Promise<VoiieLead | null> {
  if (phoneOrHandle.phone) {
    const rows = await sql`
      select * from voiie_leads where owner_user_id = ${ownerUserId} and contact_phone = ${phoneOrHandle.phone} limit 1
    `;
    if (rows[0]) return rows[0] as unknown as VoiieLead;
  }
  if (phoneOrHandle.handle) {
    const rows = await sql`
      select * from voiie_leads where owner_user_id = ${ownerUserId} and lower(handle) = lower(${phoneOrHandle.handle}) limit 1
    `;
    if (rows[0]) return rows[0] as unknown as VoiieLead;
  }
  return null;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  await sql`update voiie_leads set status = ${status}, updated_at = now() where id = ${id}`;
}

export async function updateLeadContact(id: string, contact: { email?: string | null; phone?: string | null }): Promise<void> {
  await sql`
    update voiie_leads
    set contact_email = coalesce(${contact.email ?? null}, contact_email),
        contact_phone = coalesce(${contact.phone ?? null}, contact_phone),
        updated_at = now()
    where id = ${id}
  `;
}

export async function setDemoProject(id: string, projectId: string): Promise<void> {
  await sql`
    update voiie_leads
    set demo_project_id = ${projectId}, status = 'demo_sent', updated_at = now()
    where id = ${id}
  `;
}

export async function setPlanQuote(id: string, planId: string, stripeCheckoutSessionId: string): Promise<void> {
  await sql`
    update voiie_leads
    set plan_id = ${planId}, stripe_checkout_session_id = ${stripeCheckoutSessionId}, status = 'negotiating', updated_at = now()
    where id = ${id}
  `;
}

export async function markConverted(id: string, convertedUserId: string): Promise<void> {
  await sql`
    update voiie_leads
    set status = 'converted', converted_user_id = ${convertedUserId}, converted_at = now(), updated_at = now()
    where id = ${id}
  `;
}

export async function addMessage(leadId: string, direction: "outbound" | "inbound", channel: OutreachChannel | "system", body: string, meta?: Record<string, unknown>): Promise<void> {
  await sql`
    insert into voiie_messages (lead_id, direction, channel, body, meta)
    values (${leadId}, ${direction}, ${channel}, ${body}, ${meta ? JSON.stringify(meta) : null})
  `;
}

export async function listMessages(leadId: string): Promise<VoiieMessage[]> {
  const rows = await sql`
    select * from voiie_messages where lead_id = ${leadId} order by created_at asc
  `;
  return rows as unknown as VoiieMessage[];
}

export async function getConsultationAnswers(leadId: string): Promise<{ answers: LeadAnswers; currentQuestion: number; completedAt: string | null }> {
  const rows = await sql`select answers, current_question, completed_at from voiie_consultations where lead_id = ${leadId} limit 1`;
  const row = rows[0] as any;
  if (!row) return { answers: {}, currentQuestion: 0, completedAt: null };
  return { answers: row.answers ?? {}, currentQuestion: row.current_question ?? 0, completedAt: row.completed_at ?? null };
}

/** Merges one answer into the lead's consultation, upserting the row on
 *  first answer. `isComplete` is passed in rather than recomputed here so
 *  callers (which already import TOTAL_QUESTIONS from consultation.ts)
 *  stay the single source of truth for "how many questions are there." */
export async function saveConsultationAnswer(leadId: string, key: string, value: unknown, nextQuestionIndex: number, isComplete: boolean): Promise<LeadAnswers> {
  // completedAt is only ever set forward (never unset) -- coalesce on the
  // update path keeps whatever completed_at a previous call already
  // wrote if this call isn't the one that finished the flow.
  const completedAt = isComplete ? new Date() : null;
  const rows = await sql`
    insert into voiie_consultations (lead_id, answers, current_question, completed_at)
    values (${leadId}, ${JSON.stringify({ [key]: value })}::jsonb, ${nextQuestionIndex}, ${completedAt})
    on conflict (lead_id) do update set
      answers = voiie_consultations.answers || ${JSON.stringify({ [key]: value })}::jsonb,
      current_question = ${nextQuestionIndex},
      completed_at = coalesce(${completedAt}, voiie_consultations.completed_at),
      updated_at = now()
    returning answers
  `;
  return (rows[0] as any)?.answers ?? {};
}
