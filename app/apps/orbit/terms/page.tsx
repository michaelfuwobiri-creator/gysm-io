export const metadata = { title: "Orbit — Terms of Service" };

export default function OrbitTermsPage() {
  return (
    <article>
      <h1 className="text-[32px] font-black tracking-tight mb-1">Terms of Service</h1>
      <p className="text-[13px] opacity-50 mb-8">Last updated August 15, 2026</p>

      <div className="space-y-6 text-[15px] leading-relaxed opacity-80">
        <p>
          These terms cover your use of Orbit, a product preview built and operated by GYSM.IO. By viewing
          or interacting with Orbit, you agree to the terms below.
        </p>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Preview status</h2>
          <p>
            Orbit is currently a product preview, not a fully operating dating service. Features shown may be
            illustrative, incomplete, or subject to change without notice. No warranty is made that any
            feature shown will ship as depicted, or on any particular timeline.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Acceptable use</h2>
          <p>
            You agree not to use Orbit to violate any applicable law, to harass or harm others, to scrape or
            misuse the service, or to attempt to gain unauthorized access to it or any account.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Intellectual property</h2>
          <p>
            Orbit&apos;s design, copy, and code are the property of GYSM.IO. Orbit was generated using the
            GYSM.IO AI app builder; nothing here transfers ownership of the GYSM.IO platform itself.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Limitation of liability</h2>
          <p>
            Orbit is provided &quot;as is,&quot; without warranties of any kind, to the fullest extent
            permitted by law. GYSM.IO is not liable for any damages arising from your use of, or inability to
            use, Orbit.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Changes</h2>
          <p>
            These terms may be updated as Orbit moves from preview to a fully operating product. Material
            changes will be reflected here with an updated date.
          </p>
        </section>

        <section>
          <h2 className="text-[18px] font-bold text-black mb-2">Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a href="mailto:michaelfuwobiri@gmail.com" className="underline">michaelfuwobiri@gmail.com</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
