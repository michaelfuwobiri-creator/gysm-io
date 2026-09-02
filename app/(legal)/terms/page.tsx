export const metadata = { title: "GYSM.IO — Terms of Service" };

export default function TermsPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Terms of Service</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated September 1, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          These terms govern your use of GYSM.IO ("GYSM," "we," "us"), an AI app
          builder that turns a plain-English description into a real, working app with authentication,
          a database, and Stripe payments included. By creating an account or using gysm.io, you agree
          to these terms.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">The service</h2>
          <p>GYSM lets you describe an app and generates code and a live preview for it. You can keep iterating on a build in the builder, export the code, deploy it, or publish it to BuildGuild, our public showcase. Some features consume credits or require a paid plan.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Accounts</h2>
          <p>You need an account to build with GYSM. You&apos;re responsible for keeping your login credentials secure and for all activity under your account. Provide accurate information when you sign up.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Credits and payments</h2>
          <p>Building with GYSM uses credits, purchased individually or through a subscription plan. All payments are processed securely by Stripe. Prices and plans are shown at checkout and may change going forward; purchases are generally non-refundable except where required by law.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Acceptable use</h2>
          <p>Don&apos;t use GYSM to build or publish anything illegal, to generate malware or content designed to harm others, to infringe someone else&apos;s intellectual property, or to harass, defraud, or impersonate anyone. We can suspend or terminate accounts that violate this.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Ownership of what you build</h2>
          <p>You own the app, code, and content you generate with GYSM and can export or deploy it as you like. GYSM retains all rights to the underlying platform, builder tooling, and GYSM.IO branding itself.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">BuildGuild</h2>
          <p>Publishing a build to BuildGuild makes it publicly visible and open to comments from other users. You&apos;re responsible for anything you choose to publish there and can unpublish it at any time from your dashboard.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Third-party services</h2>
          <p>GYSM relies on third-party providers, including Clerk for authentication and Stripe for payments, each governed by their own terms and privacy policies in addition to ours.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">You&apos;re interacting with AI</h2>
          <p>
            GYSM&apos;s builder is an AI system: when you type a prompt, it&apos;s sent to a
            third-party AI model (OpenAI, Google Gemini, or Anthropic Claude, depending on the tier
            you choose) to generate a response. Every app, page, and piece of code GYSM produces is
            AI-generated content, not human-written or human-reviewed by GYSM before it reaches you.
            Builds you publish to BuildGuild carry a visible "Built with GYSM.IO" notice for the same
            reason — so visitors know the app was AI-generated.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Disclaimers</h2>
          <p>GYSM.IO is provided "as is." AI-generated code can contain bugs or mistakes — review anything GYSM builds before relying on it in production. We don&apos;t guarantee the service will be uninterrupted or error-free.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Limitation of liability</h2>
          <p>To the extent permitted by law, GYSM.IO isn&apos;t liable for indirect, incidental, or consequential damages arising from your use of the service, including issues in apps you build with it.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Termination</h2>
          <p>You can stop using GYSM.IO and close your account at any time. We may suspend or terminate accounts that violate these terms.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Changes</h2>
          <p>We may update these terms as GYSM.IO evolves. We&apos;ll update the date at the top of this page when we do, and continued use after a change means you accept the revised terms.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a href="mailto:support@gysm.io" className="underline">support@gysm.io</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
