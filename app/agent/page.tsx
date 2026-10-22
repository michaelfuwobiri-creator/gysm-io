import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import AgentClient from "./AgentClient";

export const metadata = { title: "Agent · GYSM" };
export const dynamic = "force-dynamic";

// GYSM Agent: give it a goal and it writes files, runs commands, sets up
// database tables and deploys, in the user's own sandbox. Deploys and
// database changes always wait for the user's approval.
export default async function AgentPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/agent");
  const credits = await getCreditBalance(user.id);

  return (
    <AppShell active="agent">
      <AgentClient initialCredits={credits} userKey={user.id} />
    </AppShell>
  );
}
