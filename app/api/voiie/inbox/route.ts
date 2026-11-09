import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { addMessage, getLead, getSettings, listInboxThreads, listMessages, setDoNotContact, setLeadTags, updateLeadStatus } from "@/lib/voiie/db";
import { sendVoiieEmail } from "@/lib/voiie/email";
import { suggestReplies } from "@/lib/voiie/reply";

// Reply inbox. GET lists every lead that has written back, with the thread
// and suggested replies (templates -- shown, never sent). POST sends a reply
// the operator typed/approved, marks a thread handled, or opts a lead out.
// One reply per click; nothing is sent automatically.

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const threads = await listInboxThreads(user.id, 100);
  const items = [];
  for (const t of threads) {
    const messages = await listMessages(t.lead.id);
    const lastIn = [...messages].reverse().find((m) => m.direction === "inbound" && m.channel !== "system");
    items.push({
      id: t.lead.id,
      name: t.lead.display_name?.trim() || t.lead.handle,
      email: t.lead.contact_email,
      phone: t.lead.contact_phone,
      status: t.lead.status,
      doNotContact: t.lead.do_not_contact,
      lastInboundAt: t.lastInboundAt,
      unanswered: t.unanswered && !t.handled,
      handled: t.handled,
      lastChannel: lastIn?.channel ?? "email",
      canEmail: !!t.lead.contact_email && !t.lead.do_not_contact,
      suggestions: lastIn && !t.lead.do_not_contact ? suggestReplies(t.lead, lastIn.body) : [],
      messages: messages
        .filter((m) => m.channel !== "system" || m.direction === "inbound")
        .slice(-12)
        .map((m) => ({ at: m.created_at, dir: m.direction, channel: m.channel, body: m.body.slice(0, 1500) })),
    });
  }
  const settings = await getSettings(user.id);
  return Response.json({
    items,
    unanswered: items.filter((i) => i.unanswered).length,
    killSwitch: !!settings.kill_switch,
    replyDomainConfigured: !!process.env.VOIIE_REPLY_DOMAIN,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    const body = await req.json();
    const action = String(body?.action ?? "");
    const lead = await getLead(String(body?.id ?? ""), user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    if (action === "handled") {
      const tags = new Set(lead.tags ?? []);
      tags.add("inbox:handled");
      await setLeadTags(lead.id, Array.from(tags));
      return Response.json({ ok: true });
    }
    if (action === "dnc") {
      await setDoNotContact(lead.id, true);
      await updateLeadStatus(lead.id, "lost");
      await addMessage(lead.id, "outbound", "system", "Marked do-not-contact from the inbox.");
      return Response.json({ ok: true });
    }
    if (action === "reply") {
      const text = String(body?.body ?? "").trim();
      if (!text) return Response.json({ error: "Write a message first." }, { status: 400 });
      if (text.length > 5000) return Response.json({ error: "Message too long." }, { status: 400 });
      if (lead.do_not_contact) return Response.json({ error: "This lead opted out; not sending." }, { status: 409 });
      if (!lead.contact_email) return Response.json({ error: "No email on file for this lead." }, { status: 400 });
      const settings = await getSettings(user.id);
      if (settings.kill_switch) return Response.json({ error: "Kill switch is ON: sends are blocked." }, { status: 423 });

      const messages = await listMessages(lead.id);
      const lastEmailIn = [...messages].reverse().find((m) => m.direction === "inbound" && m.channel === "email");
      const subj = String((lastEmailIn?.meta as any)?.subject ?? "").trim();
      const messageId = ((lastEmailIn?.meta as any)?.message_id as string | undefined) ?? undefined;
      await sendVoiieEmail(lead, {
        subject: subj ? (/^re:/i.test(subj) ? subj : `Re: ${subj}`) : "Re: your free website demo",
        body: text,
        kind: "reply",
        inReplyTo: messageId,
      });
      const tags = new Set(lead.tags ?? []);
      tags.add("inbox:handled");
      await setLeadTags(lead.id, Array.from(tags));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error: any) {
    console.error("[voiie/inbox] action failed:", error.message);
    return Response.json({ error: "Inbox action failed." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
