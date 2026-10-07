import { redirect } from "next/navigation";
import AppShell from "../components/AppShell";
import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import ShellClient from "./ShellClient";

export const metadata = { title: "Shell · GYSM" };
export const dynamic = "force-dynamic";

// GYSM Shell: an AI-first cloud terminal. Users describe what they want,
// the AI runs (and explains) the commands in their own sandboxed Linux
// workspace -- or they type commands themselves with an "Explain" button
// on every one. Works in the browser, as a PWA, and in the iOS app (which
// loads the live site -- see capacitor.config.ts).
export default async function ShellPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?redirect_url=/shell");
  const credits = await getCreditBalance(user.id);

  return (
    <AppShell active="shell">
      <ShellClient initialCredits={credits} userKey={user.id} />
    </AppShell>
  );
}
