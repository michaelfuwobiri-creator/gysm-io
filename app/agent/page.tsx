import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { hasMonthlyPlan } from "@/lib/planUsage";
import AgentClient from "./AgentClient";

export const metadata = { title: "Agent · GYSM" };
export const dynamic = "force-dynamic";

// GYSM Agent: give it a goal and it writes files, runs commands, sets up
// database tables and deploys, in the user's own sandbox. Deploys and
// database changes always wait for the user's approval.
export default async function AgentPage({ searchParams }: { searchParams: { prompt?: string; project?: string; template?: string } }) {
  const user = await getUser();
  if (!user) {
    const back = searchParams?.prompt ? `/agent?prompt=${encodeURIComponent(searchParams.prompt)}` : "/agent";
    redirect(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
  }
  // A deep link only prefills the box; it never starts a run (no surprise credit spend).
  const initialPrompt = typeof searchParams?.prompt === "string" ? searchParams.prompt.slice(0, 2000) : "";
  const [credits, onPlan] = await Promise.all([getCreditBalance(user.id), hasMonthlyPlan(user.id)]);
  // ?project=<id> / ?template=<id>: open a saved build or a template in the Agent.
  const openBuild =
    typeof searchParams?.project === "string"
      ? { project: searchParams.project.slice(0, 64) }
      : typeof searchParams?.template === "string"
        ? { template: searchParams.template.slice(0, 64) }
        : null;

  return (
    <AppShell active="agent">
      <AgentClient initialCredits={credits} onPlan={onPlan} userKey={user.id} initialPrompt={initialPrompt} openBuild={openBuild} />
    </AppShell>
  );
}
