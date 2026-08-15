export const metadata = { title: "GYSM.IO — Support" };

export default function SupportPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Support</h1>
      <p className="text-[13px] opacity-50 mb-8">We usually reply within one business day.</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          Need help with GYSM.IO? Email us at{" "}
          <a href="mailto:michaelfuwobiri@gmail.com" className="underline font-semibold text-black">michaelfuwobiri@gmail.com</a>{" "}
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

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Before you write in</h2>
          <p>Include your account email and, if it&apos;s about a specific build, the project name or a link to it — it helps us find and fix things faster.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Other links</h2>
          <p>
            <a href="/pricing" className="underline">Pricing</a> ·{" "}
            <a href="/privacy" className="underline">Privacy Policy</a> ·{" "}
            <a href="/terms" className="underline">Terms of Service</a>
          </p>
        </section>
      </div>
    </article>
  );
}
