import { auth, currentUser } from "@clerk/nextjs/server";

// Single source of truth for "who is logged in", used by every API route
// and server component that needs the current user. Backed by Clerk (see
// middleware.ts and app/sign-in, app/sign-up) -- this used to read a
// Supabase Auth session instead, which is a different identity system that
// the login UI stopped writing to once the app moved to Clerk. That
// mismatch was why signed-in users kept getting bounced back to a login
// screen: this function was checking the wrong session.
export async function getUser(): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;

  return {
    id: userId,
    email,
    // Best display name we have for public-facing use (BuildGuild author
    // name, publisher name) -- falls back through Clerk's name fields to
    // the email's local part rather than ever showing a raw user_ id.
    name: fullName || user?.username || (email ? email.split("@")[0] : null),
  };
}
