// Immediate first touch: right after a hunt finds email leads (and on every
// hourly run, for leads found while it was quiet hours), send them their
// first email -- inside the same guards the daily autopilot uses:
// kill switch, VOIIE_AUTOSEND_DAILY_CAP (0/unset = off), the postal-address
// rule, the per-region cold-email gate, and local quiet hours (email 8-20).

import { countEmailsSentToday, getSettings, listLeadsReadyForFirstTouch } from "@/lib/voiie/db";
import { coldEmailAllowed, detectRegion, postalAddressConfigured } from "@/lib/voiie/compliance";
import { quietHours } from "@/lib/voiie/reach";
import { sendOutreach } from "@/lib/voiie/outreach";

export interface FirstTouchReport { sent: number; skipped: string | null; errors: string[] }

export async function sendFirstTouchesNow(ownerUserId: string, maxThisRun = 10): Promise<FirstTouchReport> {
  const report: FirstTouchReport = { sent: 0, skipped: null, errors: [] };
  const cap = Math.max(0, parseInt(process.env.VOIIE_AUTOSEND_DAILY_CAP || "0", 10) || 0);
  if (cap === 0) return { ...report, skipped: "autosend_off" };
  if (!postalAddressConfigured()) return { ...report, skipped: "no_postal_address" };
  const settings = await getSettings(ownerUserId);
  if (settings.kill_switch) return { ...report, skipped: "kill_switch" };

  let budget = Math.min(maxThisRun, cap - (await countEmailsSentToday(ownerUserId)));
  if (budget <= 0) return { ...report, skipped: "daily_cap_reached" };

  const ready = await listLeadsReadyForFirstTouch(ownerUserId, budget * 5);
  for (const lead of ready) {
    if (budget <= 0) break;
    if (!coldEmailAllowed(lead).ok) continue;
    if (quietHours(detectRegion(lead) ?? "US", "email").quiet) continue;
    try {
      await sendOutreach(lead.id, "email");
      report.sent++;
      budget--;
    } catch (e: any) {
      report.errors.push(`${lead.id}: ${e.message}`);
    }
  }
  return report;
}
