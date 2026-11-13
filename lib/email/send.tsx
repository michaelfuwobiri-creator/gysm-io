import { getResend } from "./resend";
import WelcomeEmail from "./templates/WelcomeEmail";
import BuildFailedEmail from "./templates/BuildFailedEmail";
import PaymentFailedEmail from "./templates/PaymentFailedEmail";
import WeeklySummaryEmail from "./templates/WeeklySummaryEmail";
import StoreOrderEmail, { type StoreOrderEmailProps } from "./templates/StoreOrderEmail";
import StoreBookingEmail, { type StoreBookingEmailProps } from "./templates/StoreBookingEmail";

const FROM = "GYSM <hello@gysm.io>";

// Every function here swallows and logs its own errors rather than
// throwing -- these are all called from the middle of something else
// that must not fail because an email didn't send (a Clerk webhook, a
// Stripe webhook, a credit refund, a cron sweep). RESEND_API_KEY being
// unset (same "optional, degrade gracefully" pattern as PostHog/GA4 and
// VOIIE's Google Places key) just means these no-op with a log line
// instead of throwing.

export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({ from: FROM, to, subject: "Welcome to GYSM", react: <WelcomeEmail name={name} /> });
  } catch (error: any) {
    console.error("[email] failed to send welcome email:", error.message);
  }
}

export async function sendBuildFailedEmail(to: string, name: string | null, kind: string, errorMessage: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Your ${kind} generation failed`,
      react: <BuildFailedEmail name={name} kind={kind} errorMessage={errorMessage} />,
    });
  } catch (error: any) {
    console.error("[email] failed to send build-failed email:", error.message);
  }
}

export async function sendPaymentFailedEmail(to: string, name: string | null, planName: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Action needed: your GYSM payment failed",
      react: <PaymentFailedEmail name={name} planName={planName} />,
    });
  } catch (error: any) {
    console.error("[email] failed to send payment-failed email:", error.message);
  }
}

export async function sendWeeklySummaryEmail(
  to: string,
  name: string | null,
  buildsThisWeek: number,
  creditsRemaining: number
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Your week on GYSM",
      react: <WeeklySummaryEmail name={name} buildsThisWeek={buildsThisWeek} creditsRemaining={creditsRemaining} />,
    });
  } catch (error: any) {
    console.error("[email] failed to send weekly summary email:", error.message);
  }
}

/** GYSM Stores: tells the seller about a paid order. Never throws. */
export async function sendStoreOrderEmail(to: string, props: StoreOrderEmailProps): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({
      from: FROM,
      to,
      subject: `New order on ${props.storeName}: ${props.total}`,
      react: <StoreOrderEmail {...props} />,
    });
  } catch (error: any) {
    console.error("[email] failed to send store order email:", error.message);
  }
}

/** GYSM Stores: booking alert to the seller, or confirmation to the customer. Never throws. */
export async function sendStoreBookingEmail(to: string, props: StoreBookingEmailProps, replyTo?: string | null): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const resend = await getResend();
    await resend.emails.send({
      from: FROM,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject: props.audience === "seller" ? `New booking: ${props.serviceName}, ${props.when}` : `Booked: ${props.serviceName} with ${props.storeName}`,
      react: <StoreBookingEmail {...props} />,
    });
  } catch (error: any) {
    console.error("[email] failed to send store booking email:", error.message);
  }
}
