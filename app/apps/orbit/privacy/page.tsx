export const metadata = { title: "Orbit — Privacy Policy" };

export default function OrbitPrivacyPage() {
  return (
    <article className="prose-content">
      <h1 className="text-[32px] font-black tracking-tight mb-1">Privacy Policy</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated August 15, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          Orbit is a product preview for a zodiac-compatibility dating concept, built and operated by GYSM.IO.
          This policy explains what Orbit collects today, in its current preview stage, and what will change
          once Orbit launches with real accounts.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Current preview stage</h2>
          <p>
            The version of Orbit you can see and click through today is a front-end product preview. The
            &quot;Join Orbit&quot; interface does not currently create an account, is not connected to a live
            signup service, and does not store any profile information, birth data, photos, or messages you
            might enter into it. No backend currently processes or retains that input.
          </p>
          <p className="mt-2">
            Standard, non-identifying web traffic data (such as IP address and browser type, via our hosting
            and analytics providers) may be logged the same way it is for any website you visit, purely for
            security and reliability purposes.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">When Orbit launches with real accounts</h2>
          <p>
            If and when Orbit ships with real sign-up, matching, and messaging, this policy will be updated
            before that launch to describe, in full, what personal data is collected (such as profile details,
            birth date/time/location used for compatibility matching, photos, and messages), how it is used,
            who it is shared with, and how you can access, export, or delete it. Continued use of Orbit after
            that update constitutes acceptance of the revised policy, which will always be posted at this
            same URL.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Age requirement</h2>
          <p>Orbit, as a dating product, is intended for users 18 years of age and older, consistent with standard dating-app policy.</p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Contact</h2>
          <p>
            Questions about this policy or Orbit can be sent to{" "}
            <a href="mailto:michaelfuwobiri@gmail.com" className="underline">michaelfuwobiri@gmail.com</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
