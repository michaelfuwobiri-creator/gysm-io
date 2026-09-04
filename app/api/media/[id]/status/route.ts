import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { markFailed } from "@/lib/media/service";
import { getPrediction } from "@/lib/media/providers/replicate";
import { getVideoStatus } from "@/lib/media/providers/heygen";

// GET /api/media/[id]/status -- polled by the client for every async
// kind (video, music, edit-via-Replicate, avatar). Looks up the stored
// provider_job_id, asks that provider for its current status, and syncs
// media_generations accordingly. Scoped to the requesting user's own
// rows -- same ownership pattern every other /api/projects/[id]/* route
// in this codebase already uses.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const rows = await sql`
    select id, user_id, kind, provider, status, credit_cost, provider_job_id, output_url, error
    from media_generations
    where id = ${params.id} and user_id = ${user.id}
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (row.status === "done" || row.status === "failed") {
    return Response.json({ id: row.id, status: row.status, url: row.output_url, error: row.error });
  }

  if (!row.provider_job_id) {
    // Still pending, provider call hasn't returned a job id yet -- ask
    // the client to check back shortly.
    return Response.json({ id: row.id, status: "processing" });
  }

  try {
    let result: { status: string; url: string | null; error: string | null };
    if (row.provider === "heygen") {
      const r = await getVideoStatus(row.provider_job_id);
      result = r;
    } else {
      const r = await getPrediction(row.provider_job_id);
      const url = Array.isArray(r.output) ? (r.output as any[])[0] : (r.output as string | null);
      result = { status: r.status === "succeeded" ? "succeeded" : r.status === "failed" ? "failed" : "processing", url: url ?? null, error: r.error };
    }

    if (result.status === "succeeded" && result.url) {
      await sql`update media_generations set status = 'done', output_url = ${result.url}, updated_at = now() where id = ${row.id}`;
      return Response.json({ id: row.id, status: "done", url: result.url });
    }
    if (result.status === "failed") {
      // Was its own inline copy of markFailed's refund+mark-failed logic
      // (two implementations of the same thing, drifting risk) -- now
      // reuses the shared one, which also sends the build-failed email
      // (item #7). `user` here is already scoped to this row's owner by
      // the `user_id = ${user.id}` WHERE clause above.
      const message = result.error || "Generation failed.";
      await markFailed(row.id, user, row.credit_cost, row.kind, message);
      return Response.json({ id: row.id, status: "failed", error: `${message} Your credits were refunded.` });
    }
    return Response.json({ id: row.id, status: "processing" });
  } catch (error: any) {
    console.error("[media/status] poll failed:", error.message);
    // Transient poll failure -- don't fail the whole generation over a
    // single flaky status check, just ask the client to retry.
    return Response.json({ id: row.id, status: "processing" });
  }
}
