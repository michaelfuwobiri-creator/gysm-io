import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a Booking App with AI — GYSM",
  description:
    "Describe your booking or scheduling app and GYSM generates a working booking product with a live preview and code you can export. Connect your own Supabase project for real sign-up and bookings data. No boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/booking-app" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for booking & scheduling apps"
      headlineLead="Build a booking app"
      headlineHighlight="before your next meeting."
      subheadline="Describe the service, the calendar, the flow. GYSM generates a working booking product — scheduling screens and a live preview, with real sign-up and data when you connect your own Supabase project."
      examplePrompt="A booking app for a hair salon with service selection, calendar availability, and deposit payments at checkout"
      promptPlaceholder="A booking app for a hair salon with calendar availability and deposit payments…"
      screenshot={{
        src: "/screenshots/builder-live.webp",
        alt: "GYSM builder generating a booking app in real time",
        caption: "The builder generating a live, working preview — not a mockup.",
      }}
      points={[
        { title: "Real example: ModernClinic", body: "A booking-driven clinic app built on GYSM is already live — the same builder generates the calendar, availability, and intake flow your service needs." },
        { title: "Deposit and checkout flow", body: "Describe the deposit or full-payment step and GYSM designs the checkout screens. You connect your own payment provider to take real payments." },
        { title: "Client accounts with Supabase", body: "Connect your own Supabase project and sign-up, login and booking history use real accounts and data, so clients can manage their own appointments." },
      ]}
      proofScreenshot={{
        src: "/screenshots/social-proof.webp",
        alt: "Founders and freelancers who have shipped products with GYSM",
        caption: "Founders, freelancers, and indie hackers shipping with GYSM.",
      }}
      faqNote="Freelancers and small businesses prototyping a booking flow for clients — this gets you to something clickable today."
    />
  );
}
