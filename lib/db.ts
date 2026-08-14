import { neon } from "@neondatabase/serverless";

// Single Postgres database for this app (Neon) -- replaces the Supabase
// project that used to hold projects/credits/subscriptions. The `users`
// table synced from Clerk (see app/api/webhooks/clerk/route.ts) already
// lived here; projects/credits/subscriptions now do too, so there's one
// database instead of two.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Set it in Vercel -> Project -> Settings -> Environment Variables (Neon connection string)."
  );
}

export const sql = neon(process.env.DATABASE_URL);
