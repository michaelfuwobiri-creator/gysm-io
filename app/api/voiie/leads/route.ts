import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { listLeads, createLeadIfNew } from "@/lib/voiie/db";

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const leads = await listLeads(user.id);
    return Response.json({ leads });
  } catch (error: any) {
    console.error("[voiie/leads] failed to list leads:", error.message);
    return Response.json({ error: "Failed to load leads." }, { status: 500 });
  }
}

/** Manually add a lead (a prospect you found yourself, outside a hunt sweep). */
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const body = await req.json();
    const handle = (body?.handle ?? "").toString().trim();
    if (!handle) return Response.json({ error: "A handle is required." }, { status: 400 });

    const platform = body?.platform === "threads" ? "threads" : body?.platform === "manual" ? "manual" : "twitter";
    const id = await createLeadIfNew(user.id, {
      platform,
      handle: handle.startsWith("@") ? handle : `@${handle}`,
      displayName: body?.displayName ?? null,
      bio: body?.bio ?? null,
      signal: body?.signal ?? "manually added",
    });

    if (!id) return Response.json({ error: "You already have a lead for that handle." }, { status: 409 });
    return Response.json({ ok: true, id });
  } catch (error: any) {
    console.error("[voiie/leads] failed to create lead:", error.message);
    return Response.json({ error: "Failed to add lead." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
