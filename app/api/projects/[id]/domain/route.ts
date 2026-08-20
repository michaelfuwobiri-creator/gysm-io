import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addDomainToProject, getDomainStatus, removeDomainFromProject } from "@/lib/vercelDomains";

// Very deliberately conservative: lowercase letters/digits/hyphens/dots
// only, must contain at least one dot, no leading/trailing hyphen per
// label. Good enough to reject junk before it ever reaches Vercel's API.
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

async function loadOwnedProject(id: string, userId: string, orgId: string | null) {
  const rows = await sql`
    select id, custom_domain, custom_domain_status from projects
    where id = ${id} and (user_id = ${userId} or (org_id is not null and org_id = ${orgId}))
    limit 1
  `;
  return (rows[0] as any) ?? null;
}

// Attach a new custom domain to this build.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const project = await loadOwnedProject(params.id, user.id, user.orgId);
    if (!project) return Response.json({ error: "Build not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!DOMAIN_RE.test(domain)) {
      return Response.json({ error: "Enter a valid domain, e.g. myapp.com or app.mydomain.com." }, { status: 400 });
    }

    const existing = await sql`select id from projects where custom_domain = ${domain} limit 1`;
    if (existing[0] && (existing[0] as any).id !== project.id) {
      return Response.json({ error: "That domain is already connected to a different build." }, { status: 409 });
    }

    const result = await addDomainToProject(domain);
    await sql`
      update projects
      set custom_domain = ${domain},
          custom_domain_status = ${result.verified ? "verified" : "pending"},
          custom_domain_verification = ${JSON.stringify(result.verification)}
      where id = ${project.id}
    `;

    return Response.json({ ok: true, domain, verified: result.verified, verification: result.verification });
  } catch (error: any) {
    console.error("[domain] failed to add domain:", error.message);
    return Response.json({ error: error.message || "Failed to add domain. Please try again." }, { status: 500 });
  }
}

// Re-check verification status with Vercel and refresh our stored state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const project = await loadOwnedProject(params.id, user.id, user.orgId);
    if (!project) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!project.custom_domain) {
      return Response.json({ domain: null, status: "none" });
    }

    const result = await getDomainStatus(project.custom_domain);
    const status = result.verified ? "verified" : "pending";
    await sql`
      update projects
      set custom_domain_status = ${status}, custom_domain_verification = ${JSON.stringify(result.verification)}
      where id = ${project.id}
    `;

    return Response.json({ domain: project.custom_domain, status, verified: result.verified, verification: result.verification });
  } catch (error: any) {
    console.error("[domain] failed to check domain status:", error.message);
    return Response.json({ error: error.message || "Failed to check domain status." }, { status: 500 });
  }
}

// Disconnect the custom domain from this build.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const project = await loadOwnedProject(params.id, user.id, user.orgId);
    if (!project) return Response.json({ error: "Build not found." }, { status: 404 });
    if (!project.custom_domain) return Response.json({ ok: true });

    try {
      await removeDomainFromProject(project.custom_domain);
    } catch (error: any) {
      // If Vercel already doesn't know about it, don't block clearing our
      // own state -- just log it.
      console.error("[domain] Vercel removal failed (continuing to clear local state):", error.message);
    }

    await sql`
      update projects
      set custom_domain = null, custom_domain_status = 'none', custom_domain_verification = null
      where id = ${project.id}
    `;

    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[domain] failed to remove domain:", error.message);
    return Response.json({ error: error.message || "Failed to remove domain. Please try again." }, { status: 500 });
  }
}
