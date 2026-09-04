import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export default function WelcomeEmail({ name }: { name: string | null }) {
  return (
    <EmailLayout preview="Welcome to GYSM.IO -- describe an app, get a real one.">
      <Text style={headingStyle}>Welcome{name ? `, ${name}` : ""}.</Text>
      <Text style={textStyle}>
        You&apos;re in. GYSM turns a plain-English description into a real, working app -- authentication,
        a database, and payments already wired in. Describe what you want, and we&apos;ll build it.
      </Text>
      <Button href="https://www.gysm.io/builder" style={buttonStyle}>
        Start building
      </Button>
      <Text style={{ ...textStyle, marginTop: 24, fontSize: 12, color: "#999" }}>
        Questions? Just reply to this email or reach us at support@gysm.io.
      </Text>
    </EmailLayout>
  );
}
