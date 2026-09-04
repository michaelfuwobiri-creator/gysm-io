import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export default function PaymentFailedEmail({ name, planName }: { name: string | null; planName: string }) {
  return (
    <EmailLayout preview={`We couldn't process your payment for ${planName}.`}>
      <Text style={headingStyle}>{name ? `${name}, we` : "We"} couldn&apos;t process your payment</Text>
      <Text style={textStyle}>
        Your card was declined for your {planName} subscription renewal. Your plan is still active for
        now, but update your payment method soon to avoid any interruption.
      </Text>
      <Button href="https://www.gysm.io/billing" style={buttonStyle}>
        Update payment method
      </Button>
      <Text style={{ ...textStyle, marginTop: 24, fontSize: 12, color: "#999" }}>
        If this keeps happening, reply to this email and we&apos;ll help sort it out.
      </Text>
    </EmailLayout>
  );
}
