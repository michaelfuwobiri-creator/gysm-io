import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

// Sent from lib/media/service.ts's markFailed() -- scoped to the async
// media generations (video, voice, music, etc.) that run long enough for
// someone to walk away from the tab, not the main prompt-driven builder
// chat, which already shows a failure inline in the same open
// conversation the instant it happens (see LinearBuilderClient.tsx) --
// an email there would just be a slower duplicate of something already
// seen.
export default function BuildFailedEmail({
  name,
  kind,
  errorMessage,
}: {
  name: string | null;
  kind: string;
  errorMessage: string;
}) {
  return (
    <EmailLayout preview={`Your ${kind} generation failed -- credits refunded.`}>
      <Text style={headingStyle}>{name ? `${name}, your` : "Your"} generation failed</Text>
      <Text style={textStyle}>
        Your {kind} generation didn&apos;t complete: <em>{errorMessage}</em>
      </Text>
      <Text style={textStyle}>
        The credits it would have cost have already been refunded to your balance automatically --
        nothing to do on your end. Feel free to try again.
      </Text>
      <Button href="https://www.gysm.io/builder" style={buttonStyle}>
        Back to GYSM
      </Button>
    </EmailLayout>
  );
}
