import BuilderClient from "./BuilderClient";

// This page used to be a self-contained stub: it checked a Supabase Auth
// session (the wrong auth system -- see lib/auth.ts) that was always empty,
// so it permanently showed "Redirecting to login...", and its one button
// did nothing but alert("Generate API will be wired next"). The real,
// working builder (calls /api/generate, streams the preview, handles
// 401/402) already existed in this folder as BuilderClient.tsx but was
// never actually rendered anywhere. This route just renders it.
//
// No auth check needed here: middleware.ts already gates /builder(.*) via
// Clerk before this page ever runs.
export default function BuilderPage() {
  return <BuilderClient />;
}
