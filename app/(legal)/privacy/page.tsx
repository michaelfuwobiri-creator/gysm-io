export const metadata = { title: "GYSM — Privacy Policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Privacy Policy</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated November 12, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          GYSM ("GYSM," "we," "us") is an AI app builder: you describe the app you want in plain
          English and GYSM generates a working web app with a live preview and a code view. This policy explains what data we collect when you use
          gysm.io, why we collect it, how AI is involved, and how you can control it.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Information we collect</h2>
          <p>When you create an account and use the builder, we collect:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Account information — your name, email address, and authentication details, handled for us by our auth provider, Clerk.</li>
            <li>Build content — the prompts you type and the app code, previews, and project data GYSM generates for you, stored in our database so you can come back and keep editing.</li>
            <li>Payment information — if you subscribe, billing is handled entirely by Stripe. GYSM never sees or stores your full card number.</li>
            <li>Usage data — how much of your plan&apos;s allowance you&apos;ve used, build history, and basic product-usage events, so the builder works reliably and we can improve it.</li>
            <li>Standard web logs — IP address, browser type, and similar technical data collected automatically by our hosting provider for security and reliability, the same as almost any website you visit.</li>
            <li>Published-build view data — if you publish a build, each page load of that build's public link logs the referring page (where the visit came from) and a timestamp, so you can see traffic on your own dashboard. This is server-side log data, not a tracking cookie set on the visitor's device.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">AI models we use</h2>
          <p>
            When you submit a prompt, GYSM sends it (and relevant build context) to one or more
            third-party AI models to generate your app — currently OpenAI (GPT), Google (Gemini), and
            Anthropic (Claude), depending on the model tier you select. Each provider processes that
            request under its own commercial API terms, which — unlike their free consumer products —
            contractually exclude using API inputs/outputs to train their models. We don't control
            those providers' infrastructure and encourage you to review their own privacy terms if you
            want the full picture. GYSM is the "provider" of the resulting AI system for the
            purposes of applicable AI regulation (such as the EU AI Act), since we determine how these
            models are integrated into and used within the product.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Cookies and analytics</h2>
          <p>
            GYSM uses Vercel Analytics, PostHog, and Google Analytics 4 for product analytics —
            aggregated usage data (which pages get visited, which features get used) that helps us see
            what's working. Vercel Analytics is cookieless and doesn't build a cross-site profile of
            you; PostHog and Google Analytics do set analytics cookies (and, if you don't turn analytics
            on, they simply never load — both are optional and off by default). We also use a small
            amount of browser local storage that's strictly necessary for the product to work (for
            example, remembering a prompt you typed before signing in, or your progress through the App
            Store submission checklist) — this isn't used for tracking and doesn't require consent under
            ePrivacy rules. On your first visit we ask for an explicit, opt-in choice before any of
            Vercel Analytics, PostHog, or Google Analytics runs; you can change that choice anytime via
            "Cookie preferences" in the site footer.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">BuildGuild and public sharing</h2>
          <p>
            If you choose to publish a build to BuildGuild, our public showcase, that app and the
            details you add (title, description, screenshots) become visible to other users and
            visitors. Anything you don&apos;t want public should stay unpublished.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">GYSM for Shopify</h2>
          <p>
            If you install the GYSM app in a Shopify store, we receive your store&apos;s
            myshopify.com address and, once you open the app, an access token that Shopify issues
            to the app for that store. We keep the token encrypted and use it only to create the
            draft products and unpublished pages you ask for. The permissions the app requests are
            limited to products and pages (content).
          </p>
          <p className="mt-3">
            The store description, product names and prices you type into the app are used to
            create those drafts. We do not store them, and we do not send them to AI model
            providers. We keep a count of how many times the app was used in your store.
          </p>
          <p className="mt-3">
            GYSM does not read, store or use your customers&apos; or orders&apos; personal data.
            When you uninstall the app we delete the stored access token, and when Shopify tells us
            to erase a shop&apos;s data we delete the remaining record for that store. To ask about
            your data, contact us at the support address on this site. Your use of Shopify is
            covered by Shopify&apos;s own terms and privacy policy.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Idea planner, MCP server and Claude plugin</h2>
          <p>
            The free idea planner on gysm.io and the GYSM MCP server (used by AI assistants such as
            Claude and ChatGPT, and by the GYSM Claude plugin) turn a description you type into a
            build plan. No sign-in is needed. The text you send is processed to produce the plan by
            our own code; we do not send it to AI model providers, store it in our database, or
            link it to an account. Like any website, our hosting provider keeps standard technical
            logs (such as IP address and request time). If you opted in to analytics, we also record
            anonymous planner events (for example which example idea you tapped) and where your
            visit first came from.
          </p>
          <p className="mt-3">
            The assistant you use (for example Claude or ChatGPT) handles your conversation under
            its own provider&apos;s terms and privacy policy; GYSM receives only what the assistant
            sends to a tool.
          </p>
          <p className="mt-3">
            The build tool works only if you connect your own GYSM API key. We use that key only to
            authenticate the request to GYSM&apos;s own API. The project it creates belongs to your
            account and is covered by the rest of this policy, including &quot;AI models we use&quot;. Without a key,
            nothing is built and you receive a link to continue in the builder.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">How we use your information</h2>
          <p>We use the data above to operate the builder, generate and store your apps, process payments, keep the service secure, respond to support requests, and improve GYSM over time. We do not sell your personal data to advertisers or data brokers.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Who we share it with</h2>
          <p>We share data only with the service providers that power GYSM, each acting under their own privacy and security commitments: Clerk (authentication), our database and hosting providers (storing and serving your builds), Stripe (payment processing), OpenAI, Google, and Anthropic (processing prompts to generate your app), and Vercel Analytics, PostHog, and Google Analytics (product analytics, only if you&apos;ve opted in). We don&apos;t share your data with third parties for their own marketing purposes.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">International data transfers</h2>
          <p>
            GYSM and the providers listed above operate infrastructure in the United States and
            elsewhere. If you're accessing GYSM from the EEA, UK, or Switzerland, your data may be
            transferred to and processed in countries outside those regions; our providers rely on
            recognized transfer mechanisms (such as the EU-U.S. Data Privacy Framework or Standard
            Contractual Clauses) to do so.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Your rights</h2>
          <p>
            Depending on where you live, you may have the right to access, correct, delete, or export
            your personal data, and to object to or restrict certain processing. EU/UK/EEA residents
            can exercise rights under the GDPR, including lodging a complaint with your local data
            protection authority. California residents have equivalent rights under the CCPA/CPRA,
            including the right to know what we collect and to delete it — we don't sell or share
            personal information for cross-context behavioral advertising, so there's no "opt out of
            sale" toggle needed. To exercise any of these rights, email{" "}
            <a href="mailto:info@gysm.io" className="underline">info@gysm.io</a>; we'll verify
            your request and respond within the time required by applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Your choices</h2>
          <p>You can edit or delete individual builds from your dashboard at any time, unpublish anything you&apos;ve shared to BuildGuild, manage cookie/analytics preferences from the site footer, and request full account and data deletion by emailing us. We&apos;ll process deletion requests within a reasonable time.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Children</h2>
          <p>GYSM is not directed at children under 13, and we do not knowingly collect personal information from them.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Changes to this policy</h2>
          <p>If this policy changes, we&apos;ll update the date at the top of this page. Continued use of GYSM after a change means you accept the revised policy.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Contact</h2>
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a href="mailto:info@gysm.io" className="underline">info@gysm.io</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
