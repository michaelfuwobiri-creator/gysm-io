import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { toChecksum } from "@/lib/wallet";
import AppShell from "@/app/components/AppShell";
import WalletClient from "./WalletClient";

export const metadata = { title: "Wallet | GYSM" };
export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/settings/wallet");
  }

  let wallets: { id: string; address: string; linkedAt: string }[] = [];
  try {
    const rows = await sql`
      select id, address, linked_at
      from user_wallets
      where user_id = ${user.id}
      order by linked_at asc
    `;
    wallets = rows.map((r: any) => ({
      id: r.id,
      address: toChecksum(r.address),
      linkedAt: new Date(r.linked_at).toISOString(),
    }));
  } catch (error: any) {
    // The table may not exist until db/migrations/0025_user_wallets.sql has run.
    console.error("[settings/wallet] failed to load wallets:", error.message);
  }

  return (
    <AppShell active="wallet">
      <div className="max-w-2xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Wallet</h1>
        <p className="text-[13px] text-black/40 mb-8">
          Link a wallet you already own to your GYSM account. GYSM never holds your keys: you prove
          ownership by signing a short message, and we store only your public address. Signing does not
          move funds or give GYSM any permission to spend.
        </p>
        <WalletClient initialWallets={wallets} />
        <p className="text-[11px] text-black/30 mt-8">
          Phase 0 runs on a test network only. GYSM Credit (GSM) has no redemption for fiat at this time.
          Credits are for platform access only.
        </p>
      </div>
    </AppShell>
  );
}
