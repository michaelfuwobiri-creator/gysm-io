// Shared Resend client -- extracted from lib/voiie/outreach.ts's own
// copy of this exact lazy-init pattern (checks RESEND_API_KEY, caches the
// client) so the transactional emails below and VOIIE's outreach sends
// share one client instead of two independent ones. outreach.ts now
// imports this too.
let resendClient: import("resend").Resend | null = null;

export async function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");
  if (!resendClient) {
    const { Resend } = await import("resend");
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}
