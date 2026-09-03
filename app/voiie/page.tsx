import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { listLeads } from "@/lib/voiie/db";
import { Dashboard } from "@/app/voiie/_components/Dashboard";

export const dynamic = "force-dynamic";

// Middleware already gates /voiie(.*) behind sign-in (see middleware.ts's
// isBuilderRoute), so this redirect is a belt-and-suspenders fallback the
// same way app/dashboard/page.tsx has one.
export default async function VoiiePage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/voiie");

  const leads = await listLeads(user.id);
  return <Dashboard initialLeads={leads} />;
}
