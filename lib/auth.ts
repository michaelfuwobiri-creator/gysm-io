import { auth, currentUser } from "@clerk/nextjs/server";

// Single source of truth for "who is logged in", used by every API route
// and server component that needs the current user. Backed by Clerk (see
// middleware.ts and app/sign-in, app/sign-up) -- this used to read a
// Supabase Auth session instead, which is a different identity system that
// the login UI stopped writing to once the app moved to Clerk. That
// mismatch was why signed-in users kept getting bounced back to a login
// screen: this function was checking the wrong session.
export async function getUser(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  // Additive: the caller's active Clerk Organization, when they have one
  // selected (see the OrganizationSwitcher in the dashboard/builder
  // headers). null means "personal account" -- the same behavior every
  // existing user already had before Organizations existed. Every route
  // that scopes a query by user_id continues to work unchanged; routes
  // that also want to allow org-shared access OR this in alongside
  // user_id (see app/api/projects/[id]/* for the pattern).
  orgId: string | null;
  orgRole: string | null;
} | null> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return null;

  const user = await currentUser();

  // Clerk's own top-level firstName/lastName only get populated if this
  // Clerk instance has "Personal information" collection turned on (User
  // & Authentication settings). A social sign-in (Google, GitHub, etc.)
  // still hands Clerk the person's real name and email on the linked
  // externalAccounts record regardless of that setting -- so without this
  // fallback, anyone who signed up via Google on an instance with that
  // setting off gets a completely blank name (no first/last name, no
  // username, and the top-level emailAddresses array can also come back
  // empty), even though Clerk has their name and email right there.
  const primaryExternal = user?.externalAccounts?.[0];

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    [primaryExternal?.firstName, primaryExternal?.lastName].filter(Boolean).join(" ").trim();

  const email =
    user?.emailAddresses?.[0]?.emailAddress ?? primaryExternal?.emailAddress ?? null;

  const username = user?.username || primaryExternal?.username || null;

  return {
    id: userId,
    email,
    // Best display name we have for public-facing use (BuildGuild author
    // name, publisher name) -- falls back through Clerk's name fields,
    // then the linked social account's name fields, then a username, then
    // the email's local part, rather than ever showing a raw user_ id.
    name: fullName || username || (email ? email.split("@")[0] : null),
    orgId: orgId ?? null,
    orgRole: orgRole ?? null,
  };
}
