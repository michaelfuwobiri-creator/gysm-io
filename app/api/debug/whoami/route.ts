import { auth } from "@clerk/nextjs/server";

// Temporary diagnostic route -- not linked from any UI -- to inspect
// exactly what auth() resolves server-side for the current request,
// while debugging why an active Clerk Organization isn't showing up in
// orgId server-side despite the OrganizationSwitcher reflecting it
// client-side. Safe to delete once the org_id propagation issue is
// resolved; returns no sensitive data beyond what the signed-in user's
// own browser already knows about their own session.
export async function GET() {
  const a = await auth();
  return Response.json({
    userId: a.userId,
    orgId: a.orgId,
    orgRole: a.orgRole,
    orgSlug: a.orgSlug,
    sessionId: a.sessionId,
    sessionClaims: a.sessionClaims,
  });
}
