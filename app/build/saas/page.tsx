import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a SaaS App with AI — GYSM.IO",
  description:
    "Describe your SaaS idea and GYSM generates a real, working product — auth, a database, and Stripe subscriptions included. Ship an MVP without writing boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/saas" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for SaaS founders"
      headlineLead="Your SaaS MVP,"
      headlineHighlight="one prompt away."
      subheadline="Skip the weeks of scaffolding. Describe what your SaaS does and GYSM generates a real product — auth, a database, and Stripe subscriptions, wired in from the first build."
      examplePrompt="A project management SaaS for freelancers with client dashboards, task boards, and monthly subscription billing"
      promptPlaceholder="A project management SaaS for freelancers with client dashboards…"
      screenshot={{
        src: "/screenshots/homepage.jpg",
        alt: "GYSM.IO homepage — describe an app, get a real product",
        caption: "Describe it once. Get a real, working product — not a mockup.",
      }}
      points={[
        { title: "Subscriptions from day one", body: "Every generated SaaS gets Stripe checkout and recurring billing wired in automatically — no separate payments integration to build." },
        { title: "A real database, not a mock", body: "Your data model is generated alongside the UI, so the dashboards, forms, and tables you describe actually persist and work." },
        { title: "Export the code or keep iterating", body: "Copy the code out and self-host, or keep refining in the builder — GYSM doesn't lock your SaaS into a black box." },
      ]}
      proofScreenshot={{
        src: "/screenshots/buildguild.jpg",
        alt: "BuildGuild public gallery of SaaS apps built on GYSM",
        caption: "BuildGuild — GYSM's public showcase of shipped apps.",
      }}
      faqNote="Founders validating an idea and indie hackers going from prompt to product without hiring a developer — this is the fast path."
    />
  );
}
