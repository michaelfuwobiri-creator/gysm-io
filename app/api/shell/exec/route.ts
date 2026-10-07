import { getUser } from "@/lib/auth";
import { getCreditBalance, chargeCredits } from "@/lib/credits";
import { SHELL_CREDITS_PER_COMMAND } from "@/lib/credits-constants";
import { runInSandbox } from "@/lib/shell/sandbox";

// A command the user typed themselves in GYSM Shell's terminal mode.
// Runs in their own sandbox (lib/shell/sandbox.ts) -- never on GYSM's servers.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const command = typeof body?.command === "string" ? body.command.trim().slice(0, 8000) : "";
  const cwd = typeof body?.cwd === "string" ? body.cwd.slice(0, 500) : "";
  if (!command) return Response.json({ error: "Type a command." }, { status: 400 });

  const balance = await getCreditBalance(user.id);
  if (balance < SHELL_CREDITS_PER_COMMAND) {
    return Response.json({ error: "You're out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  try {
    const result = await runInSandbox(user.id, command, cwd);
    const newBalance = await chargeCredits(user.id, SHELL_CREDITS_PER_COMMAND);
    return Response.json({ ...result, credits: { spent: SHELL_CREDITS_PER_COMMAND, balance: newBalance } });
  } catch (error: any) {
    console.error("[shell/exec] failed:", error?.message || error);
    return Response.json({ error: "Couldn't reach your workspace. Please try again in a moment." }, { status: 502 });
  }
}
