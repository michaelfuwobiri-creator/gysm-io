import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/voiie/db";

/** GET/PATCH the operator's hunt-safety settings (daily hunt cap,
 *  do-not-contact blacklist, spintax toggle, kill switch) -- the real
 *  state behind the Hunter panel's "Anti-spam" controls. */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  const settings = await getSettings(user.id);
  return Response.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof updateSettings>[1] = {};

  if (typeof body?.daily_hunt_limit === "number" && body.daily_hunt_limit >= 0) patch.daily_hunt_limit = Math.floor(body.daily_hunt_limit);
  if (typeof body?.spintax_enabled === "boolean") patch.spintax_enabled = body.spintax_enabled;
  if (typeof body?.kill_switch === "boolean") patch.kill_switch = body.kill_switch;
  if (Array.isArray(body?.blacklist)) patch.blacklist = body.blacklist.filter((h: unknown) => typeof h === "string");

  const settings = await updateSettings(user.id, patch);
  return Response.json({ settings });
}

export const dynamic = "force-dynamic";
