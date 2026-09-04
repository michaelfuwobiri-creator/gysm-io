import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a Dating App with AI — GYSM.IO",
  description:
    "Describe your dating or matchmaking app idea and GYSM generates a real, working product — profiles, matching, auth, and payments included. No boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/dating-app" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for dating & matchmaking apps"
      headlineLead="Build a dating app"
      headlineHighlight="in one sentence."
      subheadline="Describe the matching mechanic, the vibe, the audience. GYSM generates a real product — user profiles, auth, and a working preview, ready to iterate on."
      examplePrompt="A zodiac-based dating app where users match based on astrological compatibility, with profiles, swiping, and a chat feature"
      promptPlaceholder="A zodiac-based dating app where users match based on astrological compatibility…"
      screenshot={{
        src: "/screenshots/builder-live.webp",
        alt: "GYSM builder generating a dating app in real time",
        caption: "The builder generating a live, working preview — not a mockup.",
      }}
      points={[
        { title: "Profiles & matching, wired in", body: "User accounts, profile fields, and a matching flow are part of the generated product from the first prompt — not something you bolt on after." },
        { title: "Real example: ZodiacMoonMatch", body: "GYSM's own founder used GYSM to build and ship ZodiacMoonMatch, a live zodiac compatibility matcher, testing the exact same builder you'd use." },
        { title: "Payments for premium tiers", body: "Add paid matching boosts or premium tiers with Stripe checkout and subscriptions wired in automatically — no separate billing integration." },
      ]}
      proofScreenshot={{
        src: "/screenshots/buildguild.webp",
        alt: "BuildGuild public gallery of apps built on GYSM",
        caption: "BuildGuild — GYSM's public showcase of shipped apps.",
      }}
      faqNote="Your dating app idea deserves more than a landing page. Get a working product with real matching logic today."
    />
  );
}
