import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import ConnectorsClient from "./ConnectorsClient";
import AppShell from "../components/AppShell";

// Signed-in only, same as /dashboard. Supabase (Connect Database, wired
// up in the builder toolbar -- see lib/supabaseBackend.ts and
// db/migrations/0003_connected_backends.sql) is GYSM.IO's one real
// connector today; everything else here is an honest "not built yet,
// tell us you want it" list (db/migrations/0009_connector_requests.sql)
// rather than a fake "Connect" button with nothing behind it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ConnectorsPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/connectors");
  }

  noStore();
  let requested: string[] = [];
  try {
    const rows = await sql`select connector from connector_requests where user_id = ${user.id}`;
    requested = rows.map((r: any) => r.connector);
  } catch (error: any) {
    console.error("[connectors] failed to load requested list:", error.message);
  }

  return (
    <AppShell active="connectors">
      <ConnectorsClient initialRequested={requested} />
    </AppShell>
  );
}
