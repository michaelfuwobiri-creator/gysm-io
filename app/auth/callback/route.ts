import { NextResponse } from "next/server";

// Legacy Supabase OAuth callback. Clerk handles its own OAuth callbacks
// internally (no custom route needed), so this just forwards anyone who
// still hits the old URL to sign-in instead of 404ing.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(origin + "/sign-in");
}
