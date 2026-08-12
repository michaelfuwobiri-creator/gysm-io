import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { canAccessBuilder } from "@/lib/credits";
import BuilderClient from "./BuilderClient";

// This is now a Server Component. The paywall check runs on the server,
// before any HTML is sent to the browser -- it cannot be bypassed by editing
// localStorage in devtools, which is how the previous client-side check
// (and its visible "Test Flex Free (dev)" button) could be defeated by anyone.
export default async function BuilderPage() {
  const user = await getUser();
  if (!user) {
    redirect("/auth?redirect=/builder");
  }

  const allowed = await canAccessBuilder(user.id);
  if (!allowed) {
    redirect("/pricing?reason=no_credits");
  }

  // BuilderClient reads ?success=true via useSearchParams(), which requires
  // a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<BuilderSkeleton />}>
      <BuilderClient />
    </Suspense>
  );
}

function BuilderSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="opacity-50 text-sm animate-pulse">Loading builder…</div>
    </div>
  );
}
