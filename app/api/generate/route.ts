import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { CREDIT_COST_PER_BUILD, getCreditBalance, deductCredit } from "@/lib/credits";
import { generateWebsite, editWebsite, BuildStage } from "@/lib/ai/orchestrator";
import { buildSuggestions } from "@/lib/suggestions";

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
  try {
    const body = await req.json();
    prompt = (body?.prompt ?? "").toString().trim();
    previousHtml = typeof body?.previousHtml === "string" && body.previousHtml.trim() ? body.previousHtml : null;
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
        const result = previousHtml
          ? await editWebsite(previousHtml, prompt, onStage)
          : await generateWebsite(prompt, onStage);

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

        // Best-effort: a save failure shouldn't take away a build the user
        // already paid a credit for, but it's logged loudly so it's caught.
        let projectId: string | null = null;
        try {
          const rows = await sql`
            insert into projects (user_id, prompt, html)
            values (${user.id}, ${prompt}, ${result.html})
            returning id
          `;
          projectId = (rows[0] as any)?.id ?? null;
        } catch (error: any) {
          console.error("[generate] failed to save project:", error.message);
        }

        send({
          type: "done",
          html: result.html,
          projectId,
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
