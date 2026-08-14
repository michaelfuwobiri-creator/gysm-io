import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { UserButton } from "@clerk/nextjs";

// Reads straight from Neon. Every project generated through /api/generate
// is saved there, keyed by the Clerk user id (see lib/auth.ts and
// db/migrations/0001_init.sql).
export default async function DashboardPage() {
  const user = await getUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/dashboard");
  }

  let list: any[] = [];
  try {
    list = await sql`
      select id, prompt, html, created_at from projects
      where user_id = ${user.id}
      order by created_at desc
      limit 50
    `;
  } catch (error: any) {
    console.error("[dashboard] failed to load projects:", error.message);
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">My Builds</h1>
          <div className="flex items-center gap-4">
            <a href="/builder" className="px-4 py-2 bg-white text-black rounded-lg font-semibold">
              + New Build
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {list.length === 0 ? (
          <div className="text-white/50 p-8 border border-dashed border-white/10 rounded-xl text-center">
            No builds yet. Head to the builder and generate your first one.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {list.map((p) => (
              <div key={p.id} className="bg-white/[0.05] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs text-white/40">
                  {new Date(p.created_at).toLocaleString()} • {String(p.id).slice(0, 8)}
                </div>
                <div className="font-medium line-clamp-2">{p.prompt}</div>
                <div className="bg-white rounded-lg h-[200px] overflow-hidden pointer-events-none">
                  <iframe srcDoc={p.html} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title={p.prompt} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
