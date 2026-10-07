import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import AppShell from "@/app/components/AppShell";
import GysmlinkClient from "./GysmlinkClient";

export const metadata = { title: "gysmlink | GYSM" };
export const dynamic = "force-dynamic";

export default async function GysmlinkPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/gysmlink");
  return (
    <AppShell active="gysmlink">
      <div className="max-w-3xl mx-auto p-6 md:p-10">
        <h1 className="text-2xl font-black tracking-tight mb-1">gysmlink</h1>
        <p className="text-[13px] text-black/40 mb-8">
          One shareable page for all your links, with click analytics and a QR code. Your page lives at gysm.io/l/your-handle.
        </p>
        <GysmlinkClient />
      </div>
    </AppShell>
  );
}
