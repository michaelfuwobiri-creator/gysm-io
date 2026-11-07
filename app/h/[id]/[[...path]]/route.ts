import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { serveBuildFile } from "@/lib/serveBuild";

// Serves a hosted Agent site on its owner's own domain. The middleware
// rewrites every path of a verified custom domain here. The request's Host must
// be that project's verified custom domain, so this route can't be used to read
// any other project's files by id.

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: { id: string; path?: string[] } }) {
  if (!/^[0-9a-f-]{8,40}$/i.test(params.id)) return notFound();
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  let rows: any[];
  try {
    rows = (await sql`select custom_domain, custom_domain_status from projects where id = ${params.id} limit 1`) as any[];
  } catch (error: any) {
    console.error("[h] lookup failed:", error?.message || error);
    return new Response("Server error", { status: 500 });
  }
  const row = rows[0];
  if (!row || !host || row.custom_domain !== host || row.custom_domain_status !== "verified") return notFound();
  return serveBuildFile(params.id, params.path, { sandbox: true });
}
