import { redirect } from "next/navigation";

// Legacy URL. This used to be a full Supabase Auth login/signup form, back
// before the app moved to Clerk (see app/sign-in, app/sign-up,
// middleware.ts). It's kept only so any old links to /auth?redirect=...
// still land somewhere useful instead of 404ing or showing a login screen
// wired to an auth system nothing else uses anymore.
export default function AuthRedirect({
  searchParams,
}: {
  searchParams: { redirect?: string };
}) {
  const target = searchParams?.redirect || "/builder";
  redirect(`/sign-in?redirect_url=${encodeURIComponent(target)}`);
}
