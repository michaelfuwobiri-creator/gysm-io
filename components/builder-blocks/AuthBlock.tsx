"use client";

import { useUser, SignInButton, UserButton } from "@clerk/nextjs";

// Real Clerk wiring for the canvas Auth block, per the follow-up spec:
// signed in -> <UserButton />, signed out -> <SignInButton mode="modal">.
// Must be loaded via next/dynamic(..., { ssr: false }) by whatever renders
// it (see BlockRenderer.tsx) -- calling useUser() from any component that
// participates in SSR throws React hydration errors (#418/#423/#425) in
// this codebase, confirmed across three unrelated components already
// (app/components/NavAuthLink.tsx, app/buildguild/[id]/CommentComposer.tsx,
// app/pricing/CheckoutButton.tsx's sibling issue). Same fix applies here.
export default function AuthBlock({ showUserButton, buttonText }: { showUserButton: boolean; buttonText: string }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="h-9 w-24 rounded-full bg-white/10 animate-pulse mx-auto" />;
  }

  if (isSignedIn && showUserButton) {
    return (
      <div className="flex justify-center">
        <UserButton afterSignOutUrl="/builder-blocks" />
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <SignInButton mode="modal">
        <button className="rounded-full bg-black px-6 py-2.5 text-[13px] font-bold text-white">{buttonText}</button>
      </SignInButton>
    </div>
  );
}
