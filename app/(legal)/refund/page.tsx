export const metadata = { title: "GYSM.IO — Refund Policy" };

export default function RefundPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Refund Policy</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated September 4, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          This page explains how refunds work for credit packs and subscription plans purchased on
          GYSM.IO, and expands on the payment terms in our{" "}
          <a href="/terms" className="underline">Terms of Service</a>.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Failed builds are refunded automatically</h2>
          <p>
            If a generation fails on our end — a build, image, video, voice, or other credit-based
            action errors out or fails to start — the credits it would have cost are refunded to your
            balance automatically, immediately, with no request needed. This already happens today for
            every credit-consuming action in the builder; you&apos;ll see the failure message and your
            balance unaffected. This is the main way "refunds" work day-to-day on GYSM.IO.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Credit packs (one-time purchases)</h2>
          <p>
            Credit packs are a one-time Stripe payment, not a subscription. Once purchased, credit
            packs are non-refundable except where required by law or covered by an automatic
            failed-generation refund above — this includes cases where you simply change your mind or
            don&apos;t end up using the credits. If a technical error on our end left you charged
            without receiving the credits, email{" "}
            <a href="mailto:support@gysm.io" className="underline">support@gysm.io</a> with your
            account email and the approximate purchase time and we&apos;ll fix it.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Subscription plans</h2>
          <p>
            Builder, Pro, and Studio are monthly subscriptions billed automatically by Stripe. You can
            cancel anytime from your account&apos;s billing page (which opens Stripe&apos;s own billing
            portal) — cancelling stops future renewals, but we don&apos;t provide prorated refunds for
            the remainder of a billing period you&apos;ve already paid for. If a subscription charge
            failed to renew your credits or plan benefits due to an error on our end, contact support
            and we&apos;ll make it right.
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
            <a href="mailto:support@gysm.io" className="underline">support@gysm.io</a> and we&apos;ll
            work it out.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">How to request something not covered above</h2>
          <p>
            Email{" "}
            <a href="mailto:support@gysm.io" className="underline">support@gysm.io</a> with your
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
