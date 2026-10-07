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
//
// `variant="mobile"` renders the same auth-aware link with mobile-menu
// styling instead of the desktop `hidden md:block` treatment -- used inside
// MobileNavMenu's authSlot. It's still the exact same dynamically-imported,
// ssr:false component instance, just called a second time with a different
// prop, so the hydration fix above still applies.
export default function NavAuthLink({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return null;
  const className =
    variant === "mobile"
      ? "block text-[17px] font-medium"
      : "text-[13px] font-medium opacity-60 hidden md:block mr-2";
  return isSignedIn ? (
    <a href="/builder" className={className}>Dashboard</a>
  ) : (
    <a href="/sign-in" className={className}>Log in</a>
  );
}
