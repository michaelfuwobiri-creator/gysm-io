// Raw-SQL data access for VOIIE's own tables (db/migrations/0016_voiie.sql)
// -- following the same pattern as lib/credits.ts and lib/analytics.ts:
// no ORM, just `sql` tagged templates against @/lib/db, with every query
// scoped by owner_user_id the same way every other table in this app is
// scoped by user_id/org_id (see lib/auth.ts).

import { sql } from "@/lib/db";
import type {
  LeadAnswers,
  LeadStatus,
  OutreachChannel,
  Platform,
  RenewalStatus,
  RenewalType,
  SupportTicketStatus,
  VoiieCustomer,
  VoiieLead,
  VoiieMessage,
  VoiieRenewal,
  VoiieSettings,
  VoiieSupportTicket,
} from "@/types/voiie";

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

// ============================================================================
// Compliance + engagement (0017): tags, do-not-contact, demo-view tracking.
// ============================================================================

export async function setLeadTags(id: string, tags: string[]): Promise<void> {
  await sql`update voiie_leads set tags = ${tags}, updated_at = now() where id = ${id}`;
}

export async function setDoNotContact(id: string, value: boolean): Promise<void> {
  await sql`update voiie_leads set do_not_contact = ${value}, updated_at = now() where id = ${id}`;
}

export async function markDemoViewed(id: string): Promise<void> {
  await sql`
    update voiie_leads
    set demo_viewed_at = coalesce(demo_viewed_at, now()),
        status = case when status = 'demo_sent' then 'viewed' else status end,
        updated_at = now()
    where id = ${id}
  `;
}

// ============================================================================
// voiie_settings (0017): per-operator hunt-safety controls. Read by
// lib/voiie/hunt.ts before every hunt run and lib/voiie/outreach.ts before
// every send -- these gate real behavior, not just the dashboard UI.
// ============================================================================

const DEFAULT_SETTINGS: Omit<VoiieSettings, "owner_user_id" | "updated_at"> = {
  daily_hunt_limit: 50,
  spintax_enabled: true,
  kill_switch: false,
  blacklist: [],
};

export async function getSettings(ownerUserId: string): Promise<VoiieSettings> {
  const rows = await sql`select * from voiie_settings where owner_user_id = ${ownerUserId} limit 1`;
  const row = rows[0] as any;
  if (!row) return { owner_user_id: ownerUserId, updated_at: new Date().toISOString(), ...DEFAULT_SETTINGS };
  return { ...row, blacklist: row.blacklist ?? [] } as VoiieSettings;
}

export async function updateSettings(ownerUserId: string, patch: Partial<Omit<VoiieSettings, "owner_user_id" | "updated_at">>): Promise<VoiieSettings> {
  const current = await getSettings(ownerUserId);
  const next = { ...current, ...patch };
  const rows = await sql`
    insert into voiie_settings (owner_user_id, daily_hunt_limit, spintax_enabled, kill_switch, blacklist, updated_at)
    values (${ownerUserId}, ${next.daily_hunt_limit}, ${next.spintax_enabled}, ${next.kill_switch}, ${JSON.stringify(next.blacklist)}::jsonb, now())
    on conflict (owner_user_id) do update set
      daily_hunt_limit = ${next.daily_hunt_limit},
      spintax_enabled = ${next.spintax_enabled},
      kill_switch = ${next.kill_switch},
      blacklist = ${JSON.stringify(next.blacklist)}::jsonb,
      updated_at = now()
    returning *
  `;
  const row = rows[0] as any;
  return { ...row, blacklist: row.blacklist ?? [] } as VoiieSettings;
}

/** How many leads this operator has hunted (created) since local midnight
 *  UTC -- what the daily_hunt_limit is checked against. */
export async function countLeadsHuntedToday(ownerUserId: string): Promise<number> {
  const rows = await sql`
    select count(*)::int as n from voiie_leads
    where owner_user_id = ${ownerUserId} and created_at >= date_trunc('day', now())
  `;
  return (rows[0] as any)?.n ?? 0;
}

// ============================================================================
// voiie_customers / voiie_renewals / voiie_support_tickets (0017): the
// renewal side of the business, post-conversion.
// ============================================================================

export async function createCustomer(params: {
  leadId: string;
  ownerUserId: string;
  convertedUserId: string;
  businessName: string;
  slug: string;
  gysmSubdomain: string;
  customDomain?: string | null;
  planId: string;
  brandKit?: Record<string, unknown>;
  expiryDate: Date;
}): Promise<VoiieCustomer> {
  const rows = await sql`
    insert into voiie_customers (lead_id, owner_user_id, converted_user_id, business_name, slug, gysm_subdomain, custom_domain, plan_id, brand_kit, expiry_date)
    values (${params.leadId}, ${params.ownerUserId}, ${params.convertedUserId}, ${params.businessName}, ${params.slug}, ${params.gysmSubdomain}, ${params.customDomain ?? null}, ${params.planId}, ${JSON.stringify(params.brandKit ?? {})}::jsonb, ${params.expiryDate})
    on conflict (lead_id) do update set
      converted_user_id = excluded.converted_user_id,
      business_name = excluded.business_name,
      gysm_subdomain = excluded.gysm_subdomain,
      custom_domain = excluded.custom_domain,
      plan_id = excluded.plan_id,
      expiry_date = excluded.expiry_date,
      updated_at = now()
    returning *
  `;
  return rows[0] as unknown as VoiieCustomer;
}

export async function listCustomers(ownerUserId: string): Promise<VoiieCustomer[]> {
  const rows = await sql`select * from voiie_customers where owner_user_id = ${ownerUserId} order by created_at desc`;
  return rows as unknown as VoiieCustomer[];
}

export async function getCustomerByLead(leadId: string): Promise<VoiieCustomer | null> {
  const rows = await sql`select * from voiie_customers where lead_id = ${leadId} limit 1`;
  return (rows[0] as unknown as VoiieCustomer) ?? null;
}

export async function createRenewal(params: { customerId: string; type: RenewalType; amountCents: number; dueDate: Date }): Promise<VoiieRenewal> {
  const rows = await sql`
    insert into voiie_renewals (customer_id, type, amount_cents, due_date)
    values (${params.customerId}, ${params.type}, ${params.amountCents}, ${params.dueDate})
    returning *
  `;
  return rows[0] as unknown as VoiieRenewal;
}

export async function listRenewals(customerId: string): Promise<VoiieRenewal[]> {
  const rows = await sql`select * from voiie_renewals where customer_id = ${customerId} order by created_at desc`;
  return rows as unknown as VoiieRenewal[];
}

export async function markRenewalStatus(id: string, status: RenewalStatus, stripeCheckoutSessionId?: string): Promise<void> {
  await sql`
    update voiie_renewals
    set status = ${status},
        stripe_checkout_session_id = coalesce(${stripeCheckoutSessionId ?? null}, stripe_checkout_session_id),
        paid_at = case when ${status} = 'paid' then now() else paid_at end
    where id = ${id}
  `;
}

export async function createSupportTicket(customerId: string, issue: string): Promise<VoiieSupportTicket> {
  const rows = await sql`insert into voiie_support_tickets (customer_id, issue) values (${customerId}, ${issue}) returning *`;
  return rows[0] as unknown as VoiieSupportTicket;
}

export async function listSupportTickets(customerId: string): Promise<VoiieSupportTicket[]> {
  const rows = await sql`select * from voiie_support_tickets where customer_id = ${customerId} order by created_at desc`;
  return rows as unknown as VoiieSupportTicket[];
}

export async function updateSupportTicketStatus(id: string, status: SupportTicketStatus): Promise<void> {
  await sql`update voiie_support_tickets set status = ${status}, updated_at = now() where id = ${id}`;
}

export interface DueRenewal {
  renewal: VoiieRenewal;
  customer: VoiieCustomer;
  contactPhone: string | null;
  contactEmail: string | null;
}

/** Renewals due within `daysAhead` that haven't been sent/paid yet --
 *  what app/api/voiie/cron/renewals/route.ts sweeps on its daily run. */
export async function listDueRenewals(daysAhead: number): Promise<DueRenewal[]> {
  const rows = await sql`
    select
      r.*,
      c.id as c_id, c.lead_id as c_lead_id, c.owner_user_id as c_owner_user_id,
      c.converted_user_id as c_converted_user_id, c.business_name as c_business_name,
      c.slug as c_slug, c.gysm_subdomain as c_gysm_subdomain, c.custom_domain as c_custom_domain,
      c.plan_id as c_plan_id, c.brand_kit as c_brand_kit, c.status as c_status,
      c.expiry_date as c_expiry_date, c.created_at as c_created_at, c.updated_at as c_updated_at,
      l.contact_phone, l.contact_email
    from voiie_renewals r
    join voiie_customers c on c.id = r.customer_id
    join voiie_leads l on l.id = c.lead_id
    where r.status = 'pending' and r.due_date <= now() + (${daysAhead} || ' days')::interval
    order by r.due_date asc
  `;
  return (rows as any[]).map((row) => ({
    renewal: {
      id: row.id,
      customer_id: row.customer_id,
      type: row.type,
      amount_cents: row.amount_cents,
      status: row.status,
      due_date: row.due_date,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      paid_at: row.paid_at,
      created_at: row.created_at,
    },
    customer: {
      id: row.c_id,
      lead_id: row.c_lead_id,
      owner_user_id: row.c_owner_user_id,
      converted_user_id: row.c_converted_user_id,
      business_name: row.c_business_name,
      slug: row.c_slug,
      gysm_subdomain: row.c_gysm_subdomain,
      custom_domain: row.c_custom_domain,
      plan_id: row.c_plan_id,
      brand_kit: row.c_brand_kit ?? {},
      status: row.c_status,
      expiry_date: row.c_expiry_date,
      created_at: row.c_created_at,
      updated_at: row.c_updated_at,
    },
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
  }));
}
