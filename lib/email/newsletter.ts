import { getResend } from "@/lib/email/resend";

// Newsletter signups go through Resend Audiences/Broadcasts, not the
// transactional emails.send() API used elsewhere in this folder -- see
// lib/email/resend.ts for the shared client this reuses. Same
// "optional, degrade gracefully" contract as the rest of lib/email: no
// RESEND_API_KEY, or no audience id configured yet (the Prospects/Users
// audiences + RESEND_AUDIENCE_PROSPECTS / RESEND_AUDIENCE_USERS env vars
// are created by hand in the Resend dashboard, not by this code), and this
// just no-ops instead of throwing. Callers (the subscribe API route, the
// Clerk webhook) never need to special-case a newsletter that isn't fully
// configured in this environment yet.
export async function subscribeToAudience(email: string, audienceId: string | undefined) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[newsletter] RESEND_API_KEY not set -- skipping audience signup");
    return;
  }
  if (!audienceId) {
    console.warn("[newsletter] no Resend audience id configured -- skipping audience signup");
    return;
  }
  try {
    const resend = await getResend();
    await resend.contacts.create({ email, audienceId, unsubscribed: false });
  } catch (error: any) {
    console.error("[newsletter] failed to add contact to audience:", error?.message);
  }
}
