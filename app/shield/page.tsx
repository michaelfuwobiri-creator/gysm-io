import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AppShell from "@/app/components/AppShell";
import ShieldClient from "./ShieldClient";

export const metadata = { title: "Shield | GYSM" };
export const dynamic = "force-dynamic";

export default async function ShieldPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/shield");
  return (
    <AppShell active="shield">
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">Shield</h1>
        <p className="text-[13px] text-black/40 mb-8">
          Keep your automations (Zapier, Make, n8n or your own code) inside the permissions you gave them. Each agent asks Shield
          before a sensitive action; Shield allows or blocks it, raises an alert, and can quarantine an agent that goes rogue.
          Shield only sees what your agents report to it, so it protects workflows you wire it into.
        </p>
        <ShieldClient />
      </div>
    </AppShell>
  );
}
