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
    <EmailLayout preview={`Your ${kind} generation failed -- it didn't count toward your usage.`}>
      <Text style={headingStyle}>{name ? `${name}, your` : "Your"} generation failed</Text>
      <Text style={textStyle}>
        Your {kind} generation didn&apos;t complete: <em>{errorMessage}</em>
      </Text>
      <Text style={textStyle}>
        It didn&apos;t count toward your plan&apos;s usage -- nothing to do on your end. Feel free to
        try again.
      </Text>
      <Button href="https://www.gysm.io/agent" style={buttonStyle}>
        Back to GYSM
      </Button>
    </EmailLayout>
  );
}
