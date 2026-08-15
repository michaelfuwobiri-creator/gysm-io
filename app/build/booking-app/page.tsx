import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a Booking App with AI — GYSM.IO",
  description:
    "Describe your booking or scheduling app and GYSM generates a real, working product — calendars, auth, and payments included. Ship a booking system without writing boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/booking-app" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for booking & scheduling apps"
      headlineLead="Build a booking app"
      headlineHighlight="before your next meeting."
      subheadline="Describe the service, the calendar, the flow. GYSM generates a real booking product — scheduling, auth, and payments included, ready for clients today."
      examplePrompt="A booking app for a hair salon with service selection, calendar availability, and deposit payments at checkout"
      promptPlaceholder="A booking app for a hair salon with calendar availability and deposit payments…"
      screenshot={{
        src: "/screenshots/builder-live.jpg",
        alt: "GYSM builder generating a booking app in real time",
        caption: "The builder generating a live, working preview — not a mockup.",
      }}
      points={[
        { title: "Real example: ModernClinic", body: "A booking-driven clinic app built on GYSM is already live — the same builder generates the calendar, availability, and intake flow your service needs." },
        { title: "Deposits & payments at checkout", body: "Take deposits or full payment at time of booking with Stripe checkout wired in automatically — no separate payments integration." },
        { title: "Client accounts, done for you", body: "Sign-up, login, and booking history are wired in from the first prompt, so clients can manage their own appointments." },
      ]}
      proofScreenshot={{
        src: "/screenshots/social-proof.jpg",
        alt: "Founders and freelancers who have shipped products with GYSM",
        caption: "Founders, freelancers, and indie hackers shipping with GYSM.",
      }}
      faqNote="Freelancers and small businesses prototyping a booking flow for clients — this gets you to something clickable today."
    />
  );
}
