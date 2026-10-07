// WhatsApp client: outreach + consultation bot. Two providers, picked at
// runtime by which env vars exist:
//
//   Twilio (preferred when set): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//     TWILIO_WHATSAPP_FROM (your WhatsApp-enabled Twilio sender, E.164, e.g.
//     +14155238886 for the sandbox). Optional TWILIO_DEMO_TEMPLATE_SID (a
//     Twilio Content Template SID, "HX...", for the demo-ready message --
//     business-initiated WhatsApp messages outside the 24h reply window
//     must use an approved template) and TWILIO_WEBHOOK_URL (the exact
//     public URL Twilio posts inbound messages to, used to verify
//     X-Twilio-Signature; defaults to this request's own URL).
//     Inbound webhook: set the number's "When a message comes in" to
//     https://www.gysm.io/api/voiie/webhooks/whatsapp (HTTP POST).
//
//   Meta Graph API (fallback when Twilio vars are absent):
//     Setup: Meta for Developers -> your app -> WhatsApp -> API Setup gives
// you WHATSAPP_PHONE_ID and a temporary token; generate a permanent
// WHATSAPP_TOKEN via a System User. Webhook points at
// /api/voiie/webhooks/whatsapp.

import crypto from "node:crypto";

const GRAPH_VERSION = "v20.0";

function graphUrl(path: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured.`);
  return v;
}

// ---------------------------------------------------------------------------
// Twilio
// ---------------------------------------------------------------------------

export function isTwilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

/** "+1 208-512-0535" / "whatsapp:+12085120535" -> "whatsapp:+12085120535". */
function toTwilioAddress(phone: string): string {
  const digits = phone.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  return `whatsapp:+${digits}`;
}

async function twilioSend(to: string, fields: Record<string, string>): Promise<void> {
  const sid = requireEnv("TWILIO_ACCOUNT_SID");
  const token = requireEnv("TWILIO_AUTH_TOKEN");
  const from = requireEnv("TWILIO_WHATSAPP_FROM");

  const form = new URLSearchParams({ From: toTwilioAddress(from), To: toTwilioAddress(to), ...fields });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio WhatsApp send failed (${res.status}): ${text}`);
  }
}

/**
 * Verifies Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken,
 * fullUrl + each POST param name+value, params sorted by name)).
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signatureHeader: string | null): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Extracts the inbound text message from Twilio's form-encoded webhook params. */
export function parseTwilioIncoming(params: Record<string, string>): IncomingWhatsAppMessage | null {
  const from = params.From;
  const body = params.Body;
  if (!from || body === undefined || !params.MessageSid) return null;
  return {
    from: from.replace(/^whatsapp:\+?/i, ""), // phone number, no leading '+', same shape as the Meta path
    text: body,
    waMessageId: params.MessageSid,
  };
}

/** Sends a plain text WhatsApp message. `to` is E.164 without the leading '+'. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  if (isTwilioConfigured()) return twilioSend(to, { Body: body });

  const token = requireEnv("WHATSAPP_TOKEN");
  const phoneId = requireEnv("WHATSAPP_PHONE_ID");

  const res = await fetch(graphUrl(`${phoneId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "text",
      text: { body },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }
}

/**
 * Sends the pre-approved "voiie_demo_ready" template message.
 * Template body (configure in Meta Business Manager):
 *   "Your free demo for {{1}} is ready! Check it out: {{2}}
 *    Reply APPROVE + a plan ($79.99 / $199.99 / $499.99) any time to go live."
 *
 * IMPORTANT: this docstring is just a record of what the template says --
 * the actual wording lives in Meta Business Manager's WhatsApp template
 * library, not in this codebase, and this function only fills in {{1}}
 * and {{2}} (businessName, demoUrl) at send time. Updating this comment
 * does NOT change the live message. Since VOIIE's prices were repriced
 * to $79.99/$199.99/$499.99 (Sep 2026, was a flat $79/$199/$499), the
 * actual approved template in Meta Business Manager needs to be edited
 * (and likely re-approved by Meta, which can take time) to match -- that
 * has to happen by hand in Meta's dashboard, not from here.
 */
export async function sendDemoReadyTemplate(to: string, businessName: string, demoUrl: string): Promise<void> {
  if (isTwilioConfigured()) {
    const templateSid = process.env.TWILIO_DEMO_TEMPLATE_SID;
    if (templateSid) {
      // Approved Content Template: {{1}} = business name, {{2}} = demo URL.
      return twilioSend(to, { ContentSid: templateSid, ContentVariables: JSON.stringify({ "1": businessName, "2": demoUrl }) });
    }
    // No template configured: plain text. Delivers on the Twilio sandbox
    // and inside a 24h customer-reply window; otherwise WhatsApp rejects it.
    return twilioSend(to, {
      Body: `Your free demo for ${businessName} is ready! Check it out: ${demoUrl}\nReply APPROVE + a plan ($79.99 / $199.99 / $499.99) any time to go live.`,
    });
  }

  const token = requireEnv("WHATSAPP_TOKEN");
  const phoneId = requireEnv("WHATSAPP_PHONE_ID");

  const res = await fetch(graphUrl(`${phoneId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: "voiie_demo_ready",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: businessName }, { type: "text", text: demoUrl }],
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp template send failed (${res.status}): ${text}`);
  }
}

/** GET /api/voiie/webhooks/whatsapp verification handshake. */
export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

/** Verifies the X-Hub-Signature-256 header Meta signs webhook payloads with. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export interface IncomingWhatsAppMessage {
  from: string; // phone number, no leading '+'
  text: string;
  waMessageId: string;
}

/** Extracts the first inbound text message from a Graph API webhook payload, if any. */
export function parseIncomingMessage(payload: unknown): IncomingWhatsAppMessage | null {
  try {
    const entry = (payload as any)?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message || message.type !== "text") return null;
    return {
      from: message.from,
      text: message.text?.body ?? "",
      waMessageId: message.id,
    };
  } catch {
    return null;
  }
}
