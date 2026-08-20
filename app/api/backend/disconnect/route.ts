import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { disconnect } from "@/lib/backendStore";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  let projectId: string;
  try {
    const body = await req.json();
    projectId = body?.projectId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!projectId) return NextResponse.json({ error: "Missing projectId." }, { status: 400 });

  await disconnect(projectId, user.id);
  return NextResponse.json({ ok: true });
}

export const dynamic = "force-dynamic";
