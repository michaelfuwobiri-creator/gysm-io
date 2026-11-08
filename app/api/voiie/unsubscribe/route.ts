import { NextRequest } from "next/server";
import { getLeadUnscoped, setDoNotContact, addMessage } from "@/lib/voiie/db";
import { verifyLeadSig } from "@/lib/voiie/links";

async function unsubscribe(id: string | null, sig: string | null): Promise<boolean> {
  if (!id || !verifyLeadSig(id, sig)) return false;
  const lead = await getLeadUnscoped(id);
  if (!lead) return false;
  if (!lead.do_not_contact) {
    await setDoNotContact(id, true);
    await addMessage(id, "inbound", "system", "Unsubscribed via email link — marked do-not-contact.");
  }
  return true;
}

const page = (ok: boolean) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#111">
<h1 style="font-size:22px">${ok ? "You're unsubscribed" : "This link isn't valid"}</h1>
<p style="color:#555">${ok ? "You won't receive any more messages from us." : "Reply STOP to the email you received and we'll remove you manually."}</p></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

export async function GET(req: NextRequest) {
  return page(await unsubscribe(req.nextUrl.searchParams.get("id"), req.nextUrl.searchParams.get("sig")));
}

/** RFC 8058 one-click: mail clients POST to the List-Unsubscribe URL. */
export async function POST(req: NextRequest) {
  return page(await unsubscribe(req.nextUrl.searchParams.get("id"), req.nextUrl.searchParams.get("sig")));
}

export const dynamic = "force-dynamic";
