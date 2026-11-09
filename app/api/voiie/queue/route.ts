import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addMessage, countEmailsSentToday, getLead, listLeads, setDoNotContact, setLeadTags, updateLeadStatus } from "@/lib/voiie/db";
import { coldEmailAllowed } from "@/lib/voiie/compliance";
import { intakeUrl } from "@/lib/voiie/links";
import { computeReach, quietHours, reachTag } from "@/lib/voiie/reach";
import { sendOutreach, renderTemplate, leadLabel } from "@/lib/voiie/outreach";
import { pickPlacesTemplate, pickWeakSiteTemplate } from "@/lib/voiie/spintax";
import { getSettings } from "@/lib/voiie/db";
import type { VoiieLead } from "@/types/voiie";

// Outreach Queue. GET builds the per-lead plan; POST records outcomes or
// sends an APPROVED email batch. Nothing here sends on its own: a batch
// needs confirm=true, and caps, quiet hours, region rules, the kill switch
// and the postal-address rule are all enforced on the server.

const TERMINAL = ["lost", "paid", "converted", "deployed"];
const REACH_TAGS = ["reach:email", "reach:whatsapp", "reach:call", "reach:card", "reach:none"];

function batchCap(): number {
  return Math.max(0, parseInt(process.env.VOIIE_MANUAL_BATCH_CAP || "10", 10) || 10);
}

async function optedInIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = (await sql`
    select distinct lead_id from voiie_messages
    where direction = 'inbound' and channel = 'whatsapp' and lead_id = any(${ids})
  `) as unknown as Array<{ lead_id: string }>;
  return new Set(rows.map((r) => r.lead_id));
}

function messageFor(lead: VoiieLead, channel: string): string {
  const link = intakeUrl(lead.id);
  const name = leadLabel(lead);
  if (channel === "whatsapp") return `Hi, it's Mike following our conversation. Here's the 30-second form for your free sample website for ${name}: ${link}`;
  if (channel === "call") return `Call script: Hi, is this the owner of ${name}? I'm Mike, a local web designer. I'd like to make you a free sample homepage. May I send you a short link? (If yes, read out or send: ${link})`;
  if (channel === "card") return `Free sample website for ${name}. Scan the QR code or open: ${link}`;
  const tpl = lead.tags?.includes("weak-site") ? pickWeakSiteTemplate() : pickPlacesTemplate();
  return renderTemplate(tpl, lead, link);
}

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const all = (await listLeads(user.id, 500)).filter((l) => !l.do_not_contact && !TERMINAL.includes(l.status));
    const opted = await optedInIds(all.map((l) => l.id));
    const settings = await getSettings(user.id);
    const items = all.map((l) => {
      const reach = computeReach(l, opted.has(l.id));
      const q = reach.channel === "email" ? quietHours(reach.region, "email") : reach.channel === "call" ? quietHours(reach.region, "call") : { quiet: false };
      return {
        id: l.id,
        name: leadLabel(l),
        status: l.status,
        callStatus: (l.tags ?? []).find((t) => t.startsWith("call:"))?.replace("call:", "") ?? null,
        reach,
        quiet: q.quiet ? q.why : null,
        message: messageFor(l, reach.channel),
        link: reach.channel === "whatsapp" || reach.channel === "call" || reach.channel === "card" ? intakeUrl(l.id) : null,
      };
    });
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.reach.channel] = (counts[i.reach.channel] ?? 0) + 1;
    const sentToday = await countEmailsSentToday(user.id);
    return Response.json({ items, counts, killSwitch: settings.kill_switch, batchCap: batchCap(), sentToday });
  } catch (error: any) {
    console.error("[voiie/queue] failed:", error.message);
    return Response.json({ error: "Failed to build the queue." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "reach-all") {
      const all = (await listLeads(user.id, 500)).filter((l) => !l.do_not_contact && !TERMINAL.includes(l.status));
      const opted = await optedInIds(all.map((l) => l.id));
      const counts: Record<string, number> = {};
      for (const l of all) {
        const r = computeReach(l, opted.has(l.id));
        counts[r.channel] = (counts[r.channel] ?? 0) + 1;
        const tags = [...(l.tags ?? []).filter((t) => !REACH_TAGS.includes(t)), reachTag(r.channel)];
        await setLeadTags(l.id, tags);
      }
      return Response.json({ ok: true, total: all.length, counts });
    }

    if (action === "mark" || action === "dnc") {
      const lead = await getLead(String(body?.id ?? ""), user.id);
      if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });
      if (action === "dnc") {
        await setDoNotContact(lead.id, true);
        await updateLeadStatus(lead.id, "lost");
        await addMessage(lead.id, "outbound", "system", "Marked do-not-contact by operator.");
      } else if (body?.as === "sent") {
        if (lead.status === "new") await updateLeadStatus(lead.id, "contacted");
        await addMessage(lead.id, "outbound", "system", `Operator marked first message as sent (${String(body?.channel ?? "manual")}).`);
      } else if (body?.as === "replied") {
        await updateLeadStatus(lead.id, "replied");
        await addMessage(lead.id, "inbound", "system", "Operator marked this lead as replied.");
      } else return Response.json({ error: "Unknown mark." }, { status: 400 });
      return Response.json({ ok: true });
    }

    if (action === "send-batch") {
      if (body?.confirm !== true) return Response.json({ error: "Batch must be explicitly approved (confirm: true)." }, { status: 400 });
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
      if (!ids.length) return Response.json({ error: "No leads selected." }, { status: 400 });
      const remaining = batchCap() - (await countEmailsSentToday(user.id));
      if (remaining <= 0) return Response.json({ error: `Daily cap of ${batchCap()} emails reached.` }, { status: 429 });
      if (ids.length > remaining) return Response.json({ error: `Only ${remaining} sends left today (cap ${batchCap()}). Select fewer.` }, { status: 429 });

      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of ids) {
        const lead = await getLead(id, user.id);
        if (!lead) { results.push({ id, ok: false, error: "not found" }); continue; }
        const reach = computeReach(lead, false);
        if (reach.channel !== "email") { results.push({ id, ok: false, error: `best channel is ${reach.channel}, not email` }); continue; }
        const gate = coldEmailAllowed(lead);
        if (!gate.ok) { results.push({ id, ok: false, error: gate.reason }); continue; }
        const q = quietHours(reach.region, "email");
        if (q.quiet) { results.push({ id, ok: false, error: q.why }); continue; }
        try {
          // Same template family as the preview, so the email matches what
          // the operator approved (Places / weak-site wording, never the
          // social "saw your post" copy).
          await sendOutreach(lead.id, "email", lead.tags?.includes("weak-site") ? pickWeakSiteTemplate() : pickPlacesTemplate());
          results.push({ id, ok: true });
        } catch (e: any) {
          results.push({ id, ok: false, error: e.message });
        }
      }
      return Response.json({ ok: true, results });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    console.error("[voiie/queue] action failed:", error.message);
    return Response.json({ error: "Queue action failed." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
