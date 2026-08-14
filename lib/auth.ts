import { auth, currentUser } from "@clerk/nextjs/server";

// Single source of truth for "who is logged in", used by every API route
// and server component that needs the current user. Backed by Clerk (see
// middleware.ts and app/sign-in, app/sign-up) -- this used to read a
// Supabase Auth session instead, which is a different identity system that
// the login UI stopped writing to once the app moved to Clerk. That
// mismatch was why signed-in users kept getting bounced back to a login
// screen: this function was checking the wrong session.
export async function getUser(): Promise<{ id: string; email: string | null } | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await currentUser();
  return {
    id: userId,
    email: user?.emailAddresses?.[0]?.emailAddress ?? null,
  };
}
