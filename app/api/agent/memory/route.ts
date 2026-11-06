import { getUser } from "@/lib/auth";
import { clearMemories, forgetMemory, listMemories } from "@/lib/agentMemory";

// The user's view of what GYSM Agent remembers: list, forget one, or clear all.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  return Response.json({ memories: await listMemories(user.id) });
}

export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    await clearMemories(user.id);
    return Response.json({ ok: true });
  }
  const r = await forgetMemory(user.id, url.searchParams.get("id"));
  return Response.json({ ok: r.ok, message: r.output }, { status: r.ok ? 200 : 404 });
}
