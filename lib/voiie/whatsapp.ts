// WhatsApp Business (Meta Graph API) client: outreach + consultation bot.
//
// Setup: Meta for Developers -> your app -> WhatsApp -> API Setup gives
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

/** Sends a plain text WhatsApp message. `to` is E.164 without the leading '+'. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
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
 *    Reply APPROVE + a plan ($79 / $199 / $499) any time to go live."
 */
export async function sendDemoReadyTemplate(to: string, businessName: string, demoUrl: string): Promise<void> {
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
