import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getLead, listMessages, getConsultationAnswers } from "@/lib/voiie/db";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const lead = await getLead(params.id, user.id);
    if (!lead) return Response.json({ error: "Lead not found." }, { status: 404 });

    const [messages, consultation] = await Promise.all([
      listMessages(lead.id),
      getConsultationAnswers(lead.id),
    ]);

    // Unscoped by design: once a lead converts, its demo project's
    // ownership transfers to the new customer (see lib/voiie/billing.ts),
    // so it no longer matches `user_id = ${user.id}` -- but the VOIIE
    // operator still legitimately needs to see its live/custom-domain
    // status for the leads they personally hunted and closed.
    let project: { id: string; custom_domain: string | null; custom_domain_status: string; views: number } | null = null;
    if (lead.demo_project_id) {
      const rows = await sql`
        select id, custom_domain, custom_domain_status, views from projects where id = ${lead.demo_project_id} limit 1
      `;
      project = (rows[0] as any) ?? null;
    }

    return Response.json({ lead, messages, consultation, project });
  } catch (error: any) {
    console.error("[voiie/leads/:id] failed to load lead:", error.message);
    return Response.json({ error: "Failed to load lead." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
