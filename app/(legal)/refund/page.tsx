export const metadata = { title: "GYSM — Refund Policy", alternates: { canonical: "/refund" } };

export default function RefundPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Refund Policy</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated November 6, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          This page explains how refunds work for the GYSM subscription, and expands on the payment terms in our{" "}
          <a href="/terms" className="underline">Terms of Service</a>.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Failed builds are refunded automatically</h2>
          <p>
            If a generation fails on our end — a build, image, video, voice, or other action errors out
            or fails to start — it doesn&apos;t count toward your plan&apos;s usage. This happens
            automatically, with no request needed; you&apos;ll see the failure message and your usage
            unaffected.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Subscription</h2>
          <p>
            GYSM is a monthly subscription (€20/month) billed automatically by Stripe. You can cancel
            anytime from your account&apos;s billing page (which opens Stripe&apos;s own billing
            portal) — cancelling stops future renewals, but we don&apos;t provide prorated refunds for
            the remainder of a billing period you&apos;ve already paid for, except where required by
            law. If a charge went through but your plan didn&apos;t activate because of an error on
            our end, email{" "}
            <a href="mailto:info@gysm.io" className="underline">info@gysm.io</a> with your account
            email and the approximate time and we&apos;ll make it right.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Earlier purchases</h2>
          <p>
            Plans and packs bought before November 2026 keep working as they did. They are refunded
            on the same terms as when you bought them.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Chargebacks</h2>
          <p>
            If something&apos;s wrong with a charge, please email us before filing a chargeback with
            your card issuer or bank — we can usually resolve billing issues faster directly, and a
            chargeback can result in your account being suspended while it&apos;s investigated.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Your local consumer rights</h2>
          <p>
            Nothing on this page limits any refund, withdrawal, or cancellation right you have under
            mandatory consumer-protection law in your country or region (for example, statutory
            cooling-off periods for digital services in the EU/UK) that can&apos;t be waived by this
            policy. This isn&apos;t legal advice — if you believe a mandatory right applies to your
            purchase, contact{" "}
            <a href="mailto:info@gysm.io" className="underline">info@gysm.io</a> and we&apos;ll
            work it out.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">How to request something not covered above</h2>
          <p>
            Email{" "}
            <a href="mailto:info@gysm.io" className="underline">info@gysm.io</a> with your
            account email, what was purchased, and roughly when — we review case-by-case and reply
            within one business day.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Changes</h2>
          <p>If this policy changes, we&apos;ll update the date at the top of this page.</p>
        </section>
      </div>
    </article>
  );
}
