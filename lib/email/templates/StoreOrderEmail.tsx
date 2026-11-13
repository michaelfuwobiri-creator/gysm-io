import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export type StoreOrderEmailProps = {
  storeName: string;
  total: string;
  lines: string[];
  customer: string;
  shipping: string | null;
  dashboardUrl: string;
};

/** Sent to the seller the moment a customer pays. */
export default function StoreOrderEmail({ storeName, total, lines, customer, shipping, dashboardUrl }: StoreOrderEmailProps) {
  return (
    <EmailLayout preview={`New order on ${storeName}: ${total}`}>
      <Text style={headingStyle}>New order on {storeName}</Text>
      <Text style={textStyle}>
        {customer} just paid {total}.
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={{ ...textStyle, margin: "4px 0" }}>
          {line}
        </Text>
      ))}
      {shipping ? <Text style={{ ...textStyle, marginTop: 16 }}>Ship to: {shipping}</Text> : null}
      <Button href={dashboardUrl} style={buttonStyle}>
        Open GYSM
      </Button>
      <Text style={{ ...textStyle, marginTop: 24, fontSize: 12, color: "#999" }}>
        The payment went to your own Stripe account. GYSM sends this alert for every paid order.
      </Text>
    </EmailLayout>
  );
}
