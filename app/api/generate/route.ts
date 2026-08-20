import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { CREDIT_COST_PER_BUILD, getCreditBalance, deductCredit } from "@/lib/credits";
import { generateWebsite, editWebsite, BuildStage, extractSchemaSql, stripSchemaComment } from "@/lib/ai/orchestrator";
import { buildSuggestions } from "@/lib/suggestions";
import { getConnection, getValidAccessToken, markActive, relinkProjectId } from "@/lib/backendStore";
import { runSql } from "@/lib/supabaseBackend";

// This route runs two sequential AI calls (an OpenAI structure pass, then
// a best-effort Gemini design pass) which can legitimately take 30-100+
// seconds combined for a full app -- comfortably past Vercel's default
// serverless function timeout (10s on Hobby without this set). An earlier
// pass set this to 120, but real production traffic hit that ceiling
// within hours ("Vercel Runtime Timeout Error: Task timed out after 120
// seconds", confirmed via runtime logs) -- some prompts genuinely need
// more than 120s across both AI calls. This project has Fluid Compute
// enabled (Hobby allows up to 300s with it on explicitly), so 240s gives
// real headroom above the observed worst case without needing Pro.
export const maxDuration = 240;

// Streams newline-delimited JSON events so the client can show a live,
// step-by-step build log instead of a single opaque spinner:
//   {"type":"stage","stage":"structure"}
//   {"type":"stage","stage":"structure_done"}
//   {"type":"stage","stage":"design"}
//   {"type":"stage","stage":"design_done"}
//   {"type":"stage","stage":"saving"}
//   {"type":"done","html":"...","projectId":"...","suggestions":[...]}
// or, at any point instead of "done":
//   {"type":"error","error":"...","code":"NO_CREDITS"}
//
// Auth and the up-front credit check still happen before the stream opens,
// so 401/402 remain real HTTP status codes for BuilderClient's existing
// redirect logic. Once streaming starts the response is always 200; a
// failure past that point comes through as a NDJSON "error" event instead.
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return Response.json(
      { error: "Sign in to generate a website.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let prompt = "";
  let previousHtml: string | null = null;
  let image: string | undefined;
  let projectId: string | undefined;
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim();
    previousHtml = typeof body?.previousHtml === "string" && body.previousHtml.trim() ? body.previousHtml : null;
    projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : undefined;
    // Optional reference photo/illustration a user attaches to show the
    // builder what they want, sent as a data: URL from BuilderClient's
    // FileReader. Kept under a hard size cap here too (not just client
    // side) since Vercel's serverless request body limit is ~4.5MB --
    // an oversized image would otherwise fail the whole request with an
    // opaque platform error instead of a clear message.
    const rawImage = typeof body?.image === "string" ? body.image : undefined;
    if (rawImage) {
      if (!rawImage.startsWith("data:image/") || rawImage.length > 4_500_000) {
        return Response.json({ error: "That image is too large or not a supported format." }, { status: 400 });
      }
      image = rawImage;
    }
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!prompt) {
    return Response.json({ error: "Describe what you want to build." }, { status: 400 });
  }

  const balance = await getCreditBalance(user.id);
  if (balance < CREDIT_COST_PER_BUILD) {
    return Response.json(
      { error: "You're out of credits.", code: "NO_CREDITS" },
      { status: 402 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      const onStage = (stage: BuildStage) => send({ type: "stage", stage });

      try {
        // If this build already has an active "Connect database" link
        // (see app/api/backend/*), the AI generates against the real
        // Supabase project instead of mocked state -- see
        // BACKEND_SYSTEM_ADDENDUM in lib/ai/orchestrator.ts.
        let backendConnection: Awaited<ReturnType<typeof getConnection>> = null;
        let backendContext: { url: string; anonKey: string } | undefined;
        if (projectId) {
          try {
            backendConnection = await getConnection(projectId, user.id);
            if (backendConnection?.status === "active" && backendConnection.api_url && backendConnection.anon_key) {
              backendContext = { url: backendConnection.api_url, anonKey: backendConnection.anon_key };
            }
          } catch (error: any) {
            console.error("[generate] backend connection lookup failed:", error.message);
          }
        }

        const result = previousHtml
          ? await editWebsite(previousHtml, prompt, onStage, image, backendContext)
          : await generateWebsite(prompt, onStage, image, backendContext);

        if (!result.ok) {
          const failure = result as Extract<typeof result, { ok: false }>;
          send({ type: "error", error: failure.error });
          controller.close();
          return;
        }

        // Deduct only after a successful generation -- atomic, so a
        // concurrent request from the same user can't both pass the
        // earlier balance check and both ship a free build.
        const deducted = await deductCredit(user.id);
        if (!deducted) {
          send({ type: "error", error: "You're out of credits.", code: "NO_CREDITS" });
          controller.close();
          return;
        }

        send({ type: "stage", stage: "saving" });

        // Strip GYSM.IO's own build-time schema comment (if the model
        // emitted one) before this ever reaches the user -- it's
        // provisioning metadata, not something that belongs in "View
        // source" or the code tab.
        const schemaSql = extractSchemaSql(result.html);
        const htmlToSave = schemaSql ? stripSchemaComment(result.html) : result.html;

        // Edits (asEdit-driven, previousHtml + projectId both present)
        // always save as a NEW row rather than updating in place -- see
        // the comment above result assignment. root_project_id links
        // that new row back to the first row in its chain so the
        // builder's History panel (GET /api/projects/[id]/history) can
        // group them; a fresh, non-edit generation leaves it null and
        // starts its own chain.
        let rootProjectId: string | null = null;
        // Team builds (see db/migrations/0007, lib/auth.ts): an edit
        // inherits the source build's org -- not necessarily whatever org
        // happens to be active in the editor's session right now -- so a
        // team build can't accidentally "go personal" just because a
        // teammate had switched their Clerk org context when they opened
        // it. A brand-new (non-edit) generation uses whatever org is
        // active right now, same as every other "create" action.
        let orgIdForSave: string | null = user.orgId;
        if (projectId) {
          try {
            const rootRows = await sql`
              select coalesce(root_project_id, id) as root_id, org_id
              from projects
              where id = ${projectId} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
              limit 1
            `;
            const rootRow = rootRows[0] as any;
            rootProjectId = rootRow?.root_id ?? null;
            if (rootRow) orgIdForSave = rootRow.org_id ?? null;
          } catch (error: any) {
            console.error("[generate] failed to resolve root project id:", error.message);
          }
        }

        // Best-effort: a save failure shouldn't take away a build the user
        // already paid a credit for, but it's logged loudly so it's caught.
        let newProjectId: string | null = null;
        try {
          const rows = await sql`
            insert into projects (user_id, prompt, html, root_project_id, org_id)
            values (${user.id}, ${prompt}, ${htmlToSave}, ${rootProjectId}, ${orgIdForSave})
            returning id
          `;
          newProjectId = (rows[0] as any)?.id ?? null;
        } catch (error: any) {
          console.error("[generate] failed to save project:", error.message);
        }

        // Edits always save as a new project row -- carry a database
        // connection forward onto it instead of leaving it orphaned on
        // the version it started on.
        if (newProjectId && projectId && backendConnection && backendConnection.status !== "disconnected") {
          try {
            await relinkProjectId(projectId, newProjectId);
          } catch (error: any) {
            console.error("[generate] failed to relink backend connection:", error.message);
          }
        }

        // Push the schema for a connected backend now that we know the
        // (possibly relinked) project id it lives under.
        if (schemaSql && backendConnection?.status === "active" && backendConnection.supabase_project_ref) {
          const finalProjectId = newProjectId && projectId ? newProjectId : projectId;
          try {
            const token = await getValidAccessToken(backendConnection);
            await runSql(token, backendConnection.supabase_project_ref, schemaSql);
            if (finalProjectId && backendConnection.api_url && backendConnection.anon_key) {
              await markActive(finalProjectId, {
                apiUrl: backendConnection.api_url,
                anonKey: backendConnection.anon_key,
                schemaSql,
              });
            }
          } catch (error: any) {
            console.error("[generate] failed to push schema to Supabase:", error.message);
            if (finalProjectId) {
              try {
                await markActive(finalProjectId, {
                  apiUrl: backendConnection.api_url!,
                  anonKey: backendConnection.anon_key!,
                });
              } catch {}
            }
          }
        }

        send({
          type: "done",
          html: htmlToSave,
          projectId: newProjectId,
          suggestions: buildSuggestions(prompt),
        });
      } catch (err: any) {
        console.error("[generate] stream failed:", err?.message || err);
        send({ type: "error", error: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";
