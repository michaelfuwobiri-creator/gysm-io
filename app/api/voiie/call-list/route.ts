import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addMessage, getLead, setDoNotContact, setLeadTags, updateLeadStatus } from "@/lib/voiie/db";
import { detectRegion } from "@/lib/voiie/compliance";
import { intakeUrl } from "@/lib/voiie/links";
import { whatsappUsLink } from "@/lib/voiie/reach";
import type { VoiieLead } from "@/types/voiie";

// Call list: businesses VOIIE found that have a phone number but no email.
// Nothing here contacts anyone. The operator (Mike) calls by hand; if the
// owner says yes on the call, Mike hands over the signed /start link
// himself (read it out, or send it from his own phone). The link is only
// generated for the signed-in operator.

const CALL_TAGS = ["call:called", "call:no-answer", "call:interested", "call:not-interested", "call:wrong-number"];

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const rows = (await sql`
      select * from voiie_leads
      where owner_user_id = ${user.id}
        and contact_phone is not null and contact_phone <> ''
        and (contact_email is null or contact_email = '')
        and coalesce(do_not_contact, false) = false
        and status not in ('lost', 'paid', 'converted', 'deployed')
      order by created_at desc
      limit 100
    `) as unknown as VoiieLead[];

    const leads = rows.map((l) => {
      const callTag = (l.tags ?? []).find((t) => CALL_TAGS.includes(t)) ?? null;
      return {
        id: l.id,
        name: l.display_name || l.handle,
        phone: l.contact_phone,
        address: l.bio,
        region: detectRegion(l),
        signal: l.signal,
        status: l.status,
        callStatus: callTag ? callTag.replace("call:", "") : null,
        link: callTag === "call:interested" ? intakeUrl(l.id) : null,
      };
    });
    return Response.json({ leads, whatsappUs: whatsappUsLink() });
  } catch (error: any) {
    console.error("[voiie/call-list] failed:", error.message);
    return Response.json({ error: "Failed to load the call list." }, { status: 500 });
  }
}

/** Record the outcome of a call you made by hand. */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const body = await req.json();
    const id = String(body?.id ?? "");
    const outcome = String(body?.outcome ?? "");
    const tag = `call:${outcome}`;
    if (!CALL_TAGS.includes(tag)) return Response.json({ error: "Unknown outcome." }, { status: 400 });

    const lead = await getLead(id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const tags = [...(lead.tags ?? []).filter((t) => !CALL_TAGS.includes(t)), tag];
    await setLeadTags(lead.id, tags);

    if (outcome === "interested" || outcome === "called") {
      if (lead.status === "new") await updateLeadStatus(lead.id, "contacted");
    }
    if (outcome === "not-interested") {
      await setDoNotContact(lead.id, true);
      await updateLeadStatus(lead.id, "lost");
    }
    if (outcome === "wrong-number") await updateLeadStatus(lead.id, "lost");

    await addMessage(lead.id, "outbound", "system", `Phone call logged by operator: ${outcome}.`);
    return Response.json({ ok: true, link: outcome === "interested" ? intakeUrl(lead.id) : null });
  } catch (error: any) {
    console.error("[voiie/call-list] outcome failed:", error.message);
    return Response.json({ error: "Failed to save the call outcome." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
