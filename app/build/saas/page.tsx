import type { Metadata } from "next";
import UseCaseLanding from "@/app/components/UseCaseLanding";

export const metadata: Metadata = {
  title: "Build a SaaS App with AI — GYSM",
  description:
    "Describe your SaaS idea and GYSM generates a working product with a live preview and code you can export. Connect your own Supabase project for real sign-up and data. Ship an MVP without writing boilerplate.",
  alternates: { canonical: "https://www.gysm.io/build/saas" },
};

export default function Page() {
  return (
    <UseCaseLanding
      badge="AI app builder for SaaS founders"
      headlineLead="Your SaaS MVP,"
      headlineHighlight="one prompt away."
      subheadline="Skip the weeks of scaffolding. Describe what your SaaS does and GYSM generates a working product you can preview, copy and publish — with real sign-up and data when you connect your own Supabase project."
      examplePrompt="A project management SaaS for freelancers with client dashboards, task boards, and monthly subscription billing"
      promptPlaceholder="A project management SaaS for freelancers with client dashboards…"
      screenshot={{
        src: "/screenshots/homepage.webp",
        alt: "GYSM homepage — describe an app, get a real product",
        caption: "Describe it once. Get a real, working product — not a mockup.",
      }}
      points={[
        { title: "Pricing and checkout screens", body: "Describe your plans and GYSM lays out the pricing page and upgrade flow. You connect your own payment provider to take real payments." },
        { title: "Real data when you connect Supabase", body: "Connect your own Supabase project and the dashboards, forms and tables you describe read and write real data, with real sign-up and login. Without one, a build keeps its data in the page." },
        { title: "Export the code or keep iterating", body: "Copy the code out and self-host, or keep refining in the builder — GYSM doesn't lock your SaaS into a black box." },
      ]}
      proofScreenshot={{
        src: "/screenshots/buildguild.webp",
        alt: "BuildGuild public gallery of SaaS apps built on GYSM",
        caption: "BuildGuild — GYSM's public showcase of shipped apps.",
      }}
      faqNote="Founders validating an idea and indie hackers going from prompt to product without hiring a developer — this is the fast path."
    />
  );
}
