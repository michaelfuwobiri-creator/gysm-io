import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getUser } from "@/lib/auth";
import { getLead } from "@/lib/voiie/db";
import { intakeUrl } from "@/lib/voiie/links";
import { leadLabel } from "@/lib/voiie/outreach";

export const dynamic = "force-dynamic";

// Printable walk-in / postal card (Ctrl+P). The QR opens the lead's signed
// intake link. Operator-only.
export default async function CardPage({ params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) redirect(`/sign-in?redirect_url=/voiie/card/${params.id}`);
  const lead = await getLead(params.id, user.id);
  if (!lead) notFound();
  const url = intakeUrl(lead.id);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360 });
  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100%", padding: 24, overflowY: "auto" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", border: "2px solid #111", borderRadius: 12, padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#555" }}>A free sample website for</div>
        <div style={{ fontSize: 26, fontWeight: 800, margin: "6px 0 14px" }}>{leadLabel(lead)}</div>
        <img src={qr} alt="QR code to start" width={260} height={260} style={{ margin: "0 auto" }} />
        <div style={{ fontSize: 15, marginTop: 12 }}>Scan to answer 4 quick questions (30 seconds). We build the sample and email it to you. No cost to look, no obligation.</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 14 }}>
          From Mike at GYSM (gysm.io). Questions or to opt out of any contact: info@gysm.io
        </div>
      </div>
      <p style={{ textAlign: "center", fontSize: 12, color: "#777", marginTop: 12 }}>Print this page (Ctrl+P).</p>
    </div>
  );
}
