import { getUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { explainCommand } from "@/lib/shell/agent";

// "Explain" button on any command in GYSM Shell: a plain-English
// breakdown of the command (and its output, if it ran). Metered by tokens.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MIN_BALANCE = 10;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "GYSM Shell isn't configured yet." }, { status: 503 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  const output = typeof body?.output === "string" ? body.output : undefined;
  if (!command) return Response.json({ error: "No command to explain." }, { status: 400 });

  if ((await getCreditBalance(user.id)) < MIN_BALANCE) {
    return Response.json({ error: "You're out of credits.", code: "NO_CREDITS" }, { status: 402 });
  }

  try {
    const { text, spent, balance } = await explainCommand(user.id, command, output);
    return Response.json({ explanation: text, credits: { spent, balance } });
  } catch (error: any) {
    console.error("[shell/explain] failed:", error?.message || error);
    return Response.json({ error: "Couldn't explain that right now. Please try again." }, { status: 502 });
  }
}
