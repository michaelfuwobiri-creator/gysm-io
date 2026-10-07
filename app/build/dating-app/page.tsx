import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a Dating App with AI — GYSM",
  description:
    "Describe your dating or matchmaking app idea and GYSM generates a working product with profiles, matching screens and a live preview. Connect your own Supabase project for real sign-up and data. No boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/dating-app" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for dating & matchmaking apps"
      headlineLead="Build a dating app"
      headlineHighlight="in one sentence."
      subheadline="Describe the matching mechanic, the vibe, the audience. GYSM generates a working product — user profiles, sign-up screens and a live preview, ready to iterate on."
      examplePrompt="A zodiac-based dating app where users match based on astrological compatibility, with profiles, swiping, and a chat feature"
      promptPlaceholder="A zodiac-based dating app where users match based on astrological compatibility…"
      screenshot={{
        src: "/screenshots/builder-live.webp",
        alt: "GYSM builder generating a dating app in real time",
        caption: "The builder generating a live, working preview — not a mockup.",
      }}
      points={[
        { title: "Profiles and matching screens", body: "Profile fields and a matching flow are generated from your first prompt. Connect your own Supabase project to store real user accounts and data." },
        { title: "Real example: ZodiacMoonMatch", body: "GYSM's own founder used GYSM to build and ship ZodiacMoonMatch, a live zodiac compatibility matcher, testing the exact same builder you'd use." },
        { title: "Premium tier screens", body: "Describe paid matching boosts or premium tiers and GYSM lays out the upgrade flow. You connect your own payment provider to take real payments." },
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
