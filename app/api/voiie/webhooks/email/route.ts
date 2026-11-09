import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { addMessage, findLeadByEmailUnscoped, getLeadUnscoped, setDoNotContact, setLeadTags, updateLeadStatus } from "@/lib/voiie/db";
import { bareEmail, classifyReply, leadIdFromAddresses, stripQuoted } from "@/lib/voiie/reply";
import { maybeAutoReply } from "@/lib/voiie/autoreply";
import { notifyOwner } from "@/lib/voiie/notify";

// Resend "email.received" webhook. Setup (see docs/VOIIE-SETUP.md):
//   Resend -> Webhooks -> add https://www.gysm.io/api/voiie/webhooks/email,
//   event email.received; copy its signing secret into RESEND_WEBHOOK_SECRET.
// The webhook carries no body, so we fetch the message from Resend's
// Receiving API, match it to a lead (Reply-To address id first, sender
// email second), log it on the lead's timeline, and flip the lead to
// "replied" so the autopilot stops following up. STOP-type replies opt the
// lead out. Nothing is ever sent from here.

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("RESEND_WEBHOOK_SECRET not configured", { status: 503 });

  const raw = await req.text();
  let event: any;
  try {
    event = new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    });
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }
  if (event?.type !== "email.received") return Response.json({ ok: true });

  try {
    const d = event.data || {};
    const emailId: string | undefined = d.email_id;
    const toList: string[] = [...(d.to || []), ...(d.received_for || [])].map(String);
    const fromAddr = bareEmail(String(d.from || ""));

    // Fetch the body (not included in the webhook).
    let text = "";
    let messageId: string | null = d.message_id ?? null;
    if (emailId && process.env.RESEND_API_KEY) {
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      });
      if (r.ok) {
        const j: any = await r.json();
        text = String(j.text || "") || String(j.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        messageId = j.message_id ?? messageId;
      } else {
        console.error("[voiie/webhooks/email] receiving fetch failed:", r.status);
      }
    }
    const body = stripQuoted(text) || "(empty message)";

    const idFromAddress = leadIdFromAddresses(toList);
    const lead = (idFromAddress ? await getLeadUnscoped(idFromAddress) : null) ?? (await findLeadByEmailUnscoped(fromAddr));
    if (!lead) {
      console.warn("[voiie/webhooks/email] no lead for reply from", fromAddr);
      return Response.json({ ok: true });
    }

    await addMessage(lead.id, "inbound", "email", body, {
      subject: d.subject ?? null,
      from: fromAddr,
      resend_email_id: emailId ?? null,
      message_id: messageId,
    });

    const terminal = ["paid", "converted", "deployed", "lost"];
    if (!terminal.includes(lead.status)) await updateLeadStatus(lead.id, "replied");
    // New reply = needs attention again.
    if ((lead.tags ?? []).includes("inbox:handled")) await setLeadTags(lead.id, lead.tags.filter((t) => t !== "inbox:handled"));

    if (classifyReply(body) === "stop") {
      await setDoNotContact(lead.id, true);
      await addMessage(lead.id, "inbound", "system", "Opted out by email reply — marked do-not-contact.");
    }
    const optedOut = classifyReply(body) === "stop";
    let autoNote = "";
    if (!optedOut) {
      try {
        const r = await maybeAutoReply(lead, body, { subject: d.subject ?? null, messageId });
        autoNote = r.sent ? " (auto-replied)" : "";
      } catch (e: any) {
        console.error("[voiie/webhooks/email] auto-reply failed:", e.message);
      }
    }
    try {
      await notifyOwner(`VOIIE reply from ${lead.display_name?.trim() || lead.handle}${optedOut ? " [opted out]" : ""}${autoNote}: ${body.slice(0, 140)}`);
    } catch { /* notification is best-effort */ }
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[voiie/webhooks/email] failed:", error.message);
    return Response.json({ ok: true }); // ack so Resend doesn't retry-storm
  }
}

export const dynamic = "force-dynamic";
