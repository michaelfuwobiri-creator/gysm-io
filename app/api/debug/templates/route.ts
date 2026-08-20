import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";

export async function GET() {
  const user = await getUser();
  if (!user || !isAdminEmail(user.email)) {
    return Response.json({ error: "Not authorized." }, { status: 403 });
  }
  try {
    const list = await sql`
      select id, prompt, created_at from projects
      where is_template = true
      order by created_at desc
      limit 24
    `;
    return Response.json({ count: list.length, list });
  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
