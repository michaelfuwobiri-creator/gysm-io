export const metadata = { title: "Orbit — Support" };

export default function OrbitSupportPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Support</h1>
      <p className="text-[13px] opacity-50 mb-8">Orbit is in active preview — here's how to reach us.</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          Orbit is a zodiac-compatibility dating concept currently in product preview, built with GYSM.IO.
          If you have questions, feedback, a bug to report, or want early access when real accounts launch,
          reach out directly:
        </p>

        <div className="rounded-[16px] border border-black/5 bg-white p-5">
          <div className="text-[13px] font-bold uppercase tracking-wide opacity-40 mb-1">Email</div>
          <a href="mailto:michaelfuwobiri@gmail.com" className="text-[16px] font-semibold underline">
            michaelfuwobiri@gmail.com
          </a>
        </div>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Common questions</h2>
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-black">Can I sign up right now?</p>
              <p>Not yet — the current preview shows the product experience but isn&apos;t connected to live accounts.</p>
            </div>
            <div>
              <p className="font-semibold text-black">Is my data safe?</p>
              <p>The preview doesn&apos;t collect or store personal data. See the <a href="/apps/orbit/privacy" className="underline">Privacy Policy</a> for details.</p>
            </div>
            <div>
              <p className="font-semibold text-black">How was Orbit built?</p>
              <p>Orbit was generated with <a href="/" className="underline">GYSM.IO</a>, an AI app builder — describe an app, get a real one.</p>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
