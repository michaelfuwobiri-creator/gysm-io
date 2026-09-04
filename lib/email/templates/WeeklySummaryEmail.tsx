import { Button, Row, Column, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export default function WeeklySummaryEmail({
  name,
  buildsThisWeek,
  creditsRemaining,
}: {
  name: string | null;
  buildsThisWeek: number;
  creditsRemaining: number;
}) {
  return (
    <EmailLayout preview={`Your week on GYSM: ${buildsThisWeek} build${buildsThisWeek === 1 ? "" : "s"}.`}>
      <Text style={headingStyle}>Your week on GYSM{name ? `, ${name}` : ""}</Text>
      <Row style={{ marginBottom: 20 }}>
        <Column style={{ textAlign: "center", padding: "12px 0", borderRight: "1px solid #eee" }}>
          <Text style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{buildsThisWeek}</Text>
          <Text style={{ fontSize: 11, color: "#999", margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Build{buildsThisWeek === 1 ? "" : "s"} this week
          </Text>
        </Column>
        <Column style={{ textAlign: "center", padding: "12px 0" }}>
          <Text style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{creditsRemaining.toLocaleString()}</Text>
          <Text style={{ fontSize: 11, color: "#999", margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Credits left
          </Text>
        </Column>
      </Row>
      <Text style={textStyle}>
        {buildsThisWeek > 0
          ? "Keep the momentum going -- pick up where you left off, or start something new."
          : "You didn't build anything this week -- describe an app and GYSM will have it running in seconds."}
      </Text>
      <Button href="https://www.gysm.io/dashboard" style={buttonStyle}>
        Open dashboard
      </Button>
    </EmailLayout>
  );
}
