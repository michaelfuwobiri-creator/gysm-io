import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";

// Shared chrome for every transactional email -- dark header with the
// GYSM wordmark + fuchsia accent (matches the site's own #0A0A0A / #FF0080
// palette, see app/(legal)/layout.tsx and app/components/AppShell.tsx),
// then a plain white content card, then a footer with a real unsubscribe/
// preferences link. Each template only supplies `preview` (the inbox
// preview text) and its own body content as children.
export default function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#F5F5F0", fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 480, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 20, overflow: "hidden" }}>
          <Section style={{ backgroundColor: "#0A0A0A", padding: "24px 32px" }}>
            <Text style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.02em" }}>
              GYSM<span style={{ color: "#FF0080" }}>.IO</span>
            </Text>
          </Section>
          <Section style={{ padding: "32px" }}>{children}</Section>
          <Hr style={{ borderColor: "#eee", margin: 0 }} />
          <Section style={{ padding: "20px 32px" }}>
            <Text style={{ fontSize: 12, color: "#999", margin: 0, lineHeight: 1.6 }}>
              GYSM.IO -- Build Apps Like Legos.{" "}
              <Link href="https://www.gysm.io/support" style={{ color: "#999", textDecoration: "underline" }}>
                Support
              </Link>{" "}
              ·{" "}
              <Link href="https://www.gysm.io/support#delete-account" style={{ color: "#999", textDecoration: "underline" }}>
                Manage account
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#FF0080",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 14,
  padding: "12px 28px",
  borderRadius: 999,
  textDecoration: "none",
};

export const headingStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: "-0.02em",
  margin: "0 0 12px",
  color: "#0A0A0A",
};

export const textStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#444",
  margin: "0 0 20px",
};
