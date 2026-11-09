// Change requests on a lead's demo site ("add my logo", "add a booking
// form"). A reply that asks for a change is stored as a pending request;
// applying one runs the SAME edit pipeline gysm.io's builder uses
// (lib/ai/orchestrator.ts editWebsite) on the demo's project row, keeps the
// previous HTML so it can be undone, and (auto mode) emails the lead the
// updated link. The operator can also apply/undo from the reply inbox.

import { sql } from "@/lib/db";
import { editWebsite } from "@/lib/ai/orchestrator";
import { addMessage, getLeadUnscoped } from "@/lib/voiie/db";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { createVoiieCheckoutSession } from "@/lib/voiie/billing";
import { notifyOwner } from "@/lib/voiie/notify";
import type { VoiieLead } from "@/types/voiie";

const MAX_AUTO_CHANGES_PER_LEAD = 3;

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io";
}

/** Record a change request from the lead, to be applied by the processor
 *  (or by the operator from the inbox). `logoDataUrl` is an attached logo
 *  already turned into a data: URL (size-capped by the caller). */
export async function recordChangeRequest(leadId: string, instruction: string, logoDataUrl?: string | null): Promise<void> {
  await addMessage(leadId, "inbound", "system", `Website change requested: ${instruction.slice(0, 500)}`, {
    change_pending: true,
    instruction: instruction.slice(0, 1500),
    ...(logoDataUrl ? { logo_data: logoDataUrl } : {}),
  });
}

async function clearPending(leadId: string, result: string): Promise<void> {
  await sql`
    update voiie_messages
    set meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({ change_pending: false, change_result: result })}::jsonb
    where lead_id = ${leadId} and meta->>'change_pending' = 'true'
  `;
}

export async function countAppliedChanges(leadId: string): Promise<number> {
  const rows = (await sql`
    select count(*)::int as n from voiie_messages
    where lead_id = ${leadId} and meta->>'change_applied' = 'true' and coalesce(meta->>'undone', 'false') <> 'true'
  `) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export async function applyChange(
  leadId: string,
  instruction: string,
  opts: { logoUrl?: string | null; logoDataUrl?: string | null } = {}
): Promise<{ ok: boolean; error?: string }> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (!lead.demo_project_id) return { ok: false, error: "This lead has no demo site yet." };
  const text = instruction.trim().slice(0, 1200);
  if (!text) return { ok: false, error: "Describe the change first." };

  const rows = (await sql`select html from projects where id = ${lead.demo_project_id} limit 1`) as unknown as Array<{ html: string }>;
  const oldHtml = rows[0]?.html;
  if (!oldHtml) return { ok: false, error: "Demo site not found." };

  const parts = [`The business owner asked for this change to their website (apply only what is a website change, ignore anything else): ${text}`];
  if (opts.logoDataUrl) {
    parts.push(`Their logo is provided. Show it in the header/nav (and footer if it fits) using exactly <img src="__LOGO__" alt="Logo" style="height:40px;width:auto">. Do not alter the __LOGO__ placeholder text.`);
  } else if (opts.logoUrl) {
    parts.push(`Their logo image is at ${opts.logoUrl}. Show it in the header/nav using <img src="${opts.logoUrl}" alt="Logo" style="height:40px;width:auto">.`);
  }

  const result = await editWebsite(oldHtml, parts.join("\n"), undefined, undefined, undefined, "fast");
  if (result.ok !== true) return { ok: false, error: result.error || "The edit failed." };

  let html = result.html;
  if (opts.logoDataUrl) html = html.split("__LOGO__").join(opts.logoDataUrl);
  if (!/<\/html>/i.test(html) || html.length < oldHtml.length * 0.5) {
    return { ok: false, error: "The edited page looked broken, so it was not saved." };
  }

  await sql`update projects set html = ${html} where id = ${lead.demo_project_id}`;
  await addMessage(lead.id, "outbound", "system", `Website change applied: ${text.slice(0, 300)}`, { change_applied: true, prev_html: oldHtml });
  await clearPending(lead.id, "applied");
  return { ok: true };
}

export async function undoLastChange(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const lead = await getLeadUnscoped(leadId);
  if (!lead?.demo_project_id) return { ok: false, error: "No demo site." };
  const rows = (await sql`
    select id, meta->>'prev_html' as prev from voiie_messages
    where lead_id = ${leadId} and meta->>'change_applied' = 'true' and coalesce(meta->>'undone', 'false') <> 'true'
    order by created_at desc limit 1
  `) as unknown as Array<{ id: string; prev: string | null }>;
  if (!rows[0]?.prev) return { ok: false, error: "Nothing to undo." };
  await sql`update projects set html = ${rows[0].prev} where id = ${lead.demo_project_id}`;
  await sql`update voiie_messages set meta = meta || '{"undone": true}'::jsonb where id = ${rows[0].id}`;
  await addMessage(leadId, "outbound", "system", "Last website change undone.");
  return { ok: true };
}

/** Email the lead their updated demo link (plus the pay link if unpaid). */
export async function sendChangeDoneEmail(lead: VoiieLead): Promise<void> {
  if (!lead.contact_email || lead.do_not_contact || !lead.demo_project_id) return;
  const publicUrl = `${siteUrl()}/publish/${lead.demo_project_id}`;
  const demoUrl = `${siteUrl()}/api/voiie/track/${lead.id}?to=${encodeURIComponent(publicUrl)}`;
  let checkoutUrl: string | null = null;
  if (!["paid", "converted", "deployed"].includes(lead.status)) {
    try { checkoutUrl = (await createVoiieCheckoutSession(lead.id, "voiie_starter")).url; } catch { /* link is optional */ }
  }
  const body = [
    "Done — I've updated your demo with that change:",
    demoUrl,
    "",
    "Anything else you'd like adjusted? Just reply with what to change.",
    ...(checkoutUrl ? ["", `When you're happy with it, you can take it live here (Starter plan, one-time payment):\n${checkoutUrl}`] : []),
  ].join("\n");
  await sendVoiieEmail(lead, { subject: "Re: your website demo", body, kind: "reply", meta: { auto: true, change_done: true } });
}

/** Auto mode (VOIIE_AUTOCHANGE=1): apply pending requests and tell the lead.
 *  Max 3 automatic changes per lead; beyond that it is left for the operator. */
export async function processPendingChanges(ownerUserId: string, max = 2): Promise<{ applied: number; errors: string[] }> {
  const out = { applied: 0, errors: [] as string[] };
  if (process.env.VOIIE_AUTOCHANGE !== "1") return out;
  const rows = (await sql`
    select m.lead_id, m.meta
    from voiie_messages m join voiie_leads l on l.id = m.lead_id
    where l.owner_user_id = ${ownerUserId} and m.meta->>'change_pending' = 'true'
      and l.do_not_contact = false and l.demo_project_id is not null
    order by m.created_at asc
    limit ${max}
  `) as unknown as Array<{ lead_id: string; meta: any }>;
  for (const r of rows) {
    try {
      if ((await countAppliedChanges(r.lead_id)) >= MAX_AUTO_CHANGES_PER_LEAD) {
        await clearPending(r.lead_id, "limit");
        await notifyOwner(`VOIIE: a lead asked for a 4th change; left for you in the reply inbox.`);
        continue;
      }
      const res = await applyChange(r.lead_id, String(r.meta?.instruction ?? ""), { logoDataUrl: r.meta?.logo_data ?? null });
      if (res.ok) {
        const lead = await getLeadUnscoped(r.lead_id);
        if (lead) await sendChangeDoneEmail(lead);
        out.applied++;
      } else {
        await clearPending(r.lead_id, "error");
        out.errors.push(`${r.lead_id}: ${res.error}`);
        await notifyOwner(`VOIIE: could not auto-apply a change request (${res.error}). Open the reply inbox to handle it.`);
      }
    } catch (e: any) {
      out.errors.push(`${r.lead_id}: ${e.message}`);
    }
  }
  return out;
}
