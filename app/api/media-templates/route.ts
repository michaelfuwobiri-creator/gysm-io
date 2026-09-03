import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { listTemplates, createTemplate } from "@/lib/mediaTemplates";

// GET -- list the signed-in user's saved templates. POST -- save a new
// one. Same getUser()-gated, per-user-row shape as /api/media-assets.
export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }
  const templates = await listTemplates(user.id);
  return Response.json({ templates });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = (body?.name ?? "").toString().trim().slice(0, 80);
  const skillId = (body?.skillId ?? "").toString().trim();
  const prompt = (body?.prompt ?? "").toString().trim().slice(0, 2000);
  const pickValue = body?.pickValue ? body.pickValue.toString().trim().slice(0, 20) : null;

  if (!name) {
    return Response.json({ error: "A name is required." }, { status: 400 });
  }
  if (!skillId) {
    return Response.json({ error: "skillId is required." }, { status: 400 });
  }

  const template = await createTemplate(user.id, name, skillId, prompt, pickValue);
  return Response.json({ template });
}
