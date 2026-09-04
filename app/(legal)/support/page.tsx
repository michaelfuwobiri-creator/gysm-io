export const metadata = { title: "GYSM.IO — Support" };

export default function SupportPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Support</h1>
      <p className="text-[13px] opacity-50 mb-8">We usually reply within one business day.</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          Need help with GYSM.IO? Email us at{" "}
          <a href="mailto:support@gysm.io" className="underline font-semibold text-black">support@gysm.io</a>{" "}
          and we&apos;ll get back to you.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Common topics</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Builder issues — a build failing, stuck, or not matching your prompt</li>
            <li>Account and sign-in — trouble logging in or accessing your builds</li>
            <li>Billing and credits — questions about a charge, your plan, or credit balance</li>
            <li>Publishing to BuildGuild — help publishing, editing, or removing a public build</li>
            <li>Exporting or deploying — getting your code out of GYSM or live on the web</li>
          </ul>
        </section>

        <section id="delete-account">
          <h2 className="text-[18px] font-bold text-black mb-2">Delete your account and data</h2>
          <p className="mb-2">You can delete your GYSM.IO account yourself, anytime, directly in the app:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Sign in at gysm.io and open the builder or dashboard</li>
            <li>Click your profile icon in the top right</li>
            <li>Select <strong>Manage account</strong>, then the <strong>Security</strong> tab</li>
            <li>Click <strong>Delete account</strong> and confirm</li>
          </ol>
          <p className="mt-2">
            This permanently deletes your account, login credentials, and saved builds within a few
            minutes. Billing records that Stripe keeps for legal and tax purposes are retained by
            Stripe under their own policy even after your GYSM account is deleted. Anything you
            published to BuildGuild is removed at the same time. If you&apos;d rather we do it for
            you, email{" "}
            <a href="mailto:support@gysm.io" className="underline font-semibold text-black">support@gysm.io</a>{" "}
            from your account email and we&apos;ll delete it within a few business days.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Before you write in</h2>
          <p>Include your account email and, if it&apos;s about a specific build, the project name or a link to it — it helps us find and fix things faster.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Other links</h2>
          <p>
            <a href="/pricing" className="underline">Pricing</a> ·{" "}
            <a href="/privacy" className="underline">Privacy Policy</a> ·{" "}
            <a href="/terms" className="underline">Terms of Service</a> ·{" "}
            <a href="/refund" className="underline">Refund Policy</a>
          </p>
        </section>
      </div>
    </article>
  );
}
