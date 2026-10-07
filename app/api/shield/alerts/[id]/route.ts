import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// Acknowledge one alert (POST) of yours.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return Response.json({ error: "Alert not found." }, { status: 404 });
  try {
    await sql`update shield_alerts set acknowledged_at = now() where id = ${params.id} and user_id = ${user.id} and acknowledged_at is null`;
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error("[shield] ack failed:", error.message);
    return Response.json({ error: "Failed to acknowledge." }, { status: 500 });
  }
}
