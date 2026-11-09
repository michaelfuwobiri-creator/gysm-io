import { NextRequest } from "next/server";
import {
  getSettings,
  countEmailsSentToday,
  listLeadsReadyForFirstTouch,
  listEmailThreads,
  listLeadsAwaitingDemo,
  updateLeadStatus,
} from "@/lib/voiie/db";
import { sendOutreach, leadLabel, firstTouchSubject } from "@/lib/voiie/outreach";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { intakeUrl } from "@/lib/voiie/links";
import { createVoiieCheckoutSession } from "@/lib/voiie/billing";
import { buildDemoAndDeliver } from "@/lib/voiie/pipeline";
import { notifyOwner } from "@/lib/voiie/notify";
import { coldEmailAllowed, postalAddressConfigured } from "@/lib/voiie/compliance";

const DAY = 24 * 60 * 60 * 1000;
const ageDays = (iso: string) => (Date.now() - new Date(iso).getTime()) / DAY;

/** Daily unattended pass (see vercel.json). Everything is gated:
 *  - kill switch off,
 *  - VOIIE_AUTOSEND_DAILY_CAP > 0 for any email going to a lead who has not
 *    asked for one (first touch + follow-ups); unset/0 = nothing is sent
 *    without you,
 *  - never to do-not-contact leads (the queries exclude them),
 *  - one demo-build safety net runs regardless, since that lead already
 *    asked for the demo by filling in the form. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const owner = process.env.VOIIE_OWNER_USER_ID;
  if (!owner) return Response.json({ ok: false, error: "VOIIE_OWNER_USER_ID not configured" }, { status: 500 });

  const report = { firstTouch: 0, followUps: 0, payNudges: 0, demosFinished: 0, markedLost: 0, errors: [] as string[], skipped: "" };
  const settings = await getSettings(owner);
  if (settings.kill_switch) return Response.json({ ok: true, ...report, skipped: "kill_switch" });

  // 1. Finish demos for people who completed the form but never got one.
  for (const lead of await listLeadsAwaitingDemo(owner, 1)) {
    try {
      await buildDemoAndDeliver(lead.id);
      report.demosFinished++;
    } catch (e: any) {
      report.errors.push(`demo ${lead.id}: ${e.message}`);
    }
  }

  // 2. Payment nudges: demo delivered, not paid. These go to people who
  //    already engaged (asked for the demo), so they are not capped.
  //    Max 2: ~2 days after the demo, then ~4 days after that.
  for (const t of await listEmailThreads(owner, ["demo_sent", "viewed", "negotiating"])) {
    const due = t.payNudges === 0 ? ageDays(t.lastEmailAt) >= 2 : t.payNudges === 1 && ageDays(t.lastEmailAt) >= 4;
    if (!due) continue;
    try {
      const { url } = await createVoiieCheckoutSession(t.lead.id, "voiie_starter"); // sessions expire, so mint a fresh one
      const name = leadLabel(t.lead);
      await sendVoiieEmail(t.lead, {
        subject: `Your ${name} demo is still live`,
        body: `Hi — just a quick follow-up. Your free demo for ${name} is still available, and you can take it live here whenever you're ready:\n${url}\n\nIf you'd like changes first, just reply and tell us what to adjust.`,
        kind: "pay_nudge",
      });
      report.payNudges++;
    } catch (e: any) {
      report.errors.push(`nudge ${t.lead.id}: ${e.message}`);
    }
  }

  // 3. Cold sends (first touch + follow-ups), capped per day.
  const cap = Math.max(0, parseInt(process.env.VOIIE_AUTOSEND_DAILY_CAP || "0", 10) || 0);
  if (cap === 0) {
    report.skipped = "autosend_off (set VOIIE_AUTOSEND_DAILY_CAP to enable cold sends)";
  } else if (!postalAddressConfigured()) {
    report.skipped = "VOIIE_POSTAL_ADDRESS not set -- CAN-SPAM requires a postal address in every cold email";
  } else {
    let budget = cap - (await countEmailsSentToday(owner));

    // 3a. Follow-ups to people who got a cold email and never answered:
    //     day 3, then day 8 (final), then mark lost after another 5 days.
    for (const t of await listEmailThreads(owner, ["contacted"])) {
      if (t.lastInboundAt) continue; // they replied -- a human should take it from here
      if (!coldEmailAllowed(t.lead).ok) continue; // region not enabled for automated cold email
      const last = ageDays(t.lastEmailAt);
      try {
        if (t.emailsSent === 1 && last >= 3 && budget > 0) {
          await sendVoiieEmail(t.lead, {
            subject: `Re: ${firstTouchSubject(t.lead)}`,
            body: `Hi — following up in case my last note got buried. Answer four quick questions (about 30 seconds) and you get a free, mobile-friendly demo site for ${leadLabel(t.lead)}: homepage, services and a contact page, written from your answers. No signup, nothing to pay to look:\n${intakeUrl(t.lead.id)}`,
            kind: "follow_up",
          });
          budget--; report.followUps++;
        } else if (t.emailsSent === 2 && last >= 5 && budget > 0) {
          await sendVoiieEmail(t.lead, {
            subject: `Last note about your free demo`,
            body: `Hi — I won't keep emailing after this. If you ever want a free demo site for ${leadLabel(t.lead)}, this link stays open:\n${intakeUrl(t.lead.id)}`,
            kind: "final_follow_up",
          });
          budget--; report.followUps++;
        } else if (t.emailsSent >= 3 && last >= 5) {
          await updateLeadStatus(t.lead.id, "lost");
          report.markedLost++;
        }
      } catch (e: any) {
        report.errors.push(`follow-up ${t.lead.id}: ${e.message}`);
      }
    }

    // 3b. Fresh first touches with whatever budget is left.
    if (budget > 0) {
      const ready = (await listLeadsReadyForFirstTouch(owner, budget * 5)).filter((l) => coldEmailAllowed(l).ok).slice(0, budget);
      for (const lead of ready) {
        try {
          await sendOutreach(lead.id, "email");
          report.firstTouch++;
        } catch (e: any) {
          report.errors.push(`first-touch ${lead.id}: ${e.message}`);
        }
      }
    }
  }

  console.log("[voiie/cron/autopilot] run done", { ...report, errors: report.errors.length });
  if (report.firstTouch + report.followUps + report.payNudges + report.demosFinished + report.markedLost > 0) {
    await notifyOwner(
      `Autopilot: ${report.firstTouch} new emails, ${report.followUps} follow-ups, ${report.payNudges} pay reminders, ${report.demosFinished} demos finished${report.errors.length ? `, ${report.errors.length} errors` : ""}.`
    );
  }
  return Response.json({ ok: true, ...report });
}

export const maxDuration = 240;
export const dynamic = "force-dynamic";
