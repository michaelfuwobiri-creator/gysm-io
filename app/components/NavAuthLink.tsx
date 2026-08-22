"use client";

import { useUser } from "@clerk/nextjs";

// The homepage nav's one auth-dependent link (Log in / Dashboard). Split
// into its own component and loaded via next/dynamic(..., { ssr: false })
// from app/page.tsx -- NOT because of static/dynamic rendering (that was
// ruled out: /pricing is genuinely dynamic per-request and shows the exact
// same errors) and NOT because of the isLoaded/isSignedIn branch itself
// (three separate fixes to that branch, in three different directions, all
// left the errors unchanged).
//
// The actual pattern: every page that calls @clerk/nextjs's useUser() from
// a component that's part of SSR -- app/page.tsx's nav, app/pricing's
// CheckoutButton (which calls useUser() but never even uses the result
// during render), app/buildguild/[id]/CommentSection.tsx -- throws the
// identical #418/#423/#425 trio. app/dashboard (via AppShell's *server-side*
// getUser(), never the client useUser() hook) is the one confirmed-clean
// page. That means calling useUser() itself, during a render that
// participates in SSR, is what diverges -- independent of what the
// component does with the returned value. ssr:false sidesteps this by
// construction: this component never runs on the server at all, so there's
// nothing for its first client render to mismatch against.
export default function NavAuthLink() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return null;
  return isSignedIn ? (
    <a href="/builder" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Dashboard</a>
  ) : (
    <a href="/sign-in" className="text-[13px] font-medium opacity-60 hidden md:block mr-2">Log in</a>
  );
}
