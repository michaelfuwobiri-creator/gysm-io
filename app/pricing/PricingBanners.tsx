"use client";

import { useSearchParams } from "next/navigation";

// The homepage ("/") is a static server component with no per-request data
// dependency, gets cached by Vercel (x-vercel-cache: HIT), and -- confirmed
// live across two separate checks -- throws zero hydration errors. /pricing
// used to read `searchParams` directly as a prop on the page's Server
// Component to show three optional query-string banners (?reason=no_credits,
// ?canceled=true, ?upsell=connect_database). Per Next.js's own docs, reading
// the `searchParams` prop on a page forces that whole route out of static
// rendering into fully-dynamic, per-request SSR (confirmed live: /pricing
// was x-vercel-cache: MISS, age: 0 on every request, unlike the cached "/").
// That was the one structural difference between the clean page and the
// broken one after every other fix (useUser() removal, the font-tag fix)
// had already landed and /pricing was still throwing #418/#423/#425 on
// every fresh load. Moving the searchParams read into its own client-only,
// ssr:false island -- same pattern as NavAuthLink.tsx and
// CommentComposer.tsx -- means PricingPage itself no longer touches
// searchParams, so it can go back to being a plain static server component
// like the homepage, and this banner strip renders after mount instead of
// diverging between server and client render.
export default function PricingBanners() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const canceled = searchParams.get("canceled");
  const upsell = searchParams.get("upsell");

  return (
    <>
      {reason === "no_credits" && (
        <div className="max-w-2xl mx-auto mb-8 text-center rounded-2xl border border-black/10 bg-white shadow-sm p-4 text-sm">
          You're out of credits — pick a plan below to keep building.
        </div>
      )}
      {canceled === "true" && (
        <div className="max-w-2xl mx-auto mb-8 text-center rounded-2xl border border-black/10 bg-white shadow-sm p-4 text-sm">
          Checkout canceled — no charge was made.
        </div>
      )}
      {upsell === "connect_database" && (
        <div className="max-w-2xl mx-auto mb-8 text-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
          "Connect database" links a build to your own Supabase project for real data and real auth — available on any monthly plan below.
        </div>
      )}
    </>
  );
}
