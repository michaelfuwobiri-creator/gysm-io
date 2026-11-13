import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export type StoreShippedEmailProps = { storeName: string; lines: string[]; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null };

/** Sent to the customer when the seller ships their order. */
export default function StoreShippedEmail({ storeName, lines, carrier, trackingNumber, trackingUrl }: StoreShippedEmailProps) {
  return (
    <EmailLayout preview={`Your order from ${storeName} is on its way`}>
      <Text style={headingStyle}>Your order is on its way</Text>
      <Text style={textStyle}>{storeName} has shipped your order.</Text>
      {lines.map((line, i) => (
        <Text key={i} style={{ ...textStyle, margin: "4px 0" }}>
          {line}
        </Text>
      ))}
      {carrier || trackingNumber ? (
        <Text style={{ ...textStyle, marginTop: 16 }}>
          {[carrier, trackingNumber && `tracking ${trackingNumber}`].filter(Boolean).join(", ")}
        </Text>
      ) : null}
      {trackingUrl ? (
        <Button href={trackingUrl} style={buttonStyle}>
          Track your parcel
        </Button>
      ) : null}
      <Text style={{ ...textStyle, marginTop: 24, fontSize: 12, color: "#999" }}>Questions? Reply to this email to reach {storeName}.</Text>
    </EmailLayout>
  );
}
