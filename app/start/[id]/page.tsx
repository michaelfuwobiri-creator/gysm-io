import { getLeadUnscoped } from "@/lib/voiie/db";
import { verifyLeadSig } from "@/lib/voiie/links";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get your free website demo", robots: { index: false, follow: false } };

export default async function StartPage({ params, searchParams }: { params: { id: string }; searchParams: { sig?: string } }) {
  const sig = searchParams.sig ?? "";
  const lead = verifyLeadSig(params.id, sig) ? await getLeadUnscoped(params.id) : null;

  if (!lead || lead.do_not_contact) {
    return (
      <main style={{ maxWidth: 440, margin: "15vh auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>This link isn&apos;t valid</h1>
        <p style={{ color: "#666" }}>Ask for a fresh link, or visit gysm.io to build a site yourself.</p>
      </main>
    );
  }

  return (
    <IntakeForm
      leadId={lead.id}
      sig={sig}
      businessGuess={lead.display_name ?? ""}
      emailGuess={lead.contact_email ?? ""}
    />
  );
}
