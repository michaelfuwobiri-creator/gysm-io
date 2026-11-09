import { getLeadUnscoped } from "@/lib/voiie/db";
import { acceptLeadLink } from "@/lib/voiie/links";
import IntakeForm from "./IntakeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Get your free website demo", robots: { index: false, follow: false } };

export default async function StartPage({ params, searchParams }: { params: { id: string }; searchParams: { sig?: string } }) {
  const sig = searchParams.sig ?? "";
  const lead = acceptLeadLink(params.id, sig) ? await getLeadUnscoped(params.id) : null;

  if (!lead) {
    return (
      <main style={{ maxWidth: 440, margin: "15vh auto", padding: "0 20px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <h1 style={{ fontSize: 22 }}>This link isn&apos;t valid</h1>
        <p style={{ color: "#666" }}>Ask for a fresh link, or visit gysm.io to build a site yourself.</p>
      </main>
    );
  }

  return (
    <>
      {lead.do_not_contact && (
        <p style={{ maxWidth: 560, margin: "24px auto 0", padding: "10px 14px", background: "#fff7e6", border: "1px solid #f5d08a", borderRadius: 8, fontFamily: "system-ui, sans-serif", fontSize: 14, color: "#5c4300" }}>
          You were marked as unsubscribed from our emails. Filling in this form means you do want your free demo, and we&apos;ll email it to you.
        </p>
      )}
      <IntakeForm
        leadId={lead.id}
        sig={sig}
        businessGuess={lead.display_name ?? ""}
        emailGuess={lead.contact_email ?? ""}
      />
    </>
  );
}
