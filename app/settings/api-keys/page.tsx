import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import AppShell from "@/app/components/AppShell";
import ApiKeysClient from "./ApiKeysClient";

export const metadata = { title: "API Keys | GYSM.IO" };
export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/settings/api-keys");
  }

  let keys: any[] = [];
  try {
    keys = await sql`
      select id, name, key_prefix, created_at, last_used_at, revoked_at
      from api_keys
      where user_id = ${user.id} and revoked_at is null
      order by created_at desc
    `;
  } catch (error: any) {
    console.error("[settings/api-keys] failed to load keys:", error.message);
  }

  return (
    <AppShell active="api-keys">
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">API Keys</h1>
        <p className="text-[13px] text-black/40 mb-8">
          Generate real apps outside the builder UI --{" "}
          <code className="text-[12px] bg-black/5 px-1.5 py-0.5 rounded">POST /api/v1/generate</code> with{" "}
          <code className="text-[12px] bg-black/5 px-1.5 py-0.5 rounded">{"{\"prompt\": \"...\"}"}</code> and an{" "}
          <code className="text-[12px] bg-black/5 px-1.5 py-0.5 rounded">Authorization: Bearer</code> header. Same
          credit cost as a build in the UI.
        </p>
        <ApiKeysClient initialKeys={keys} />
      </div>
    </AppShell>
  );
}
