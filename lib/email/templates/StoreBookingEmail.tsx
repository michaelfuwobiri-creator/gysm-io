import { Button, Text } from "@react-email/components";
import EmailLayout, { buttonStyle, headingStyle, textStyle } from "./EmailLayout";

export type StoreBookingEmailProps = {
  audience: "seller" | "customer";
  storeName: string;
  serviceName: string;
  when: string;
  customer: string;
  paid: string | null;
  note: string;
  url: string;
};

/** Sent to the seller (new booking) and to the customer (booking confirmed). */
export default function StoreBookingEmail({ audience, storeName, serviceName, when, customer, paid, note, url }: StoreBookingEmailProps) {
  const seller = audience === "seller";
  return (
    <EmailLayout preview={seller ? `New booking: ${serviceName}, ${when}` : `Your booking with ${storeName} is confirmed`}>
      <Text style={headingStyle}>{seller ? `New booking on ${storeName}` : `You're booked with ${storeName}`}</Text>
      <Text style={textStyle}>
        {serviceName} on {when}.
      </Text>
      {seller ? <Text style={textStyle}>Booked by {customer}.</Text> : null}
      {paid ? <Text style={textStyle}>Paid: {paid}.</Text> : null}
      {note ? <Text style={textStyle}>Note: {note}</Text> : null}
      <Button href={url} style={buttonStyle}>
        {seller ? "Open GYSM" : `Visit ${storeName}`}
      </Button>
      <Text style={{ ...textStyle, marginTop: 24, fontSize: 12, color: "#999" }}>
        {seller ? "Payments for bookings go to your own Stripe account." : "To change or cancel, reply to the store directly."}
      </Text>
    </EmailLayout>
  );
}
