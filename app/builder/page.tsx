import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/isAdmin";
import { sql } from "@/lib/db";
import { getCreditBalance } from "@/lib/credits";
import { getBrandKit } from "@/lib/brandKit";
import LinearBuilderClient from "./LinearBuilderClient";

// Middleware already gates /builder(.*) via Clerk, so getUser() here is
// just for the optional ?projectId=/?template= resume lookups below and
// the isAdmin flag, not a security check on its own.
//
// ?projectId=<id> reloads a previously saved build (see app/dashboard) into
// the editor -- preview, code tab, and further edits all pick up right
// where the build left off, instead of the dashboard only being a static
// thumbnail gallery.
//
// ?template=<id> (see app/templates) loads a curated is_template=true
// build's html/prompt as a *starting point* for a brand new build --
// deliberately does NOT set initialProjectId, so the first save/edit
// creates a fresh project owned by whoever clicked "Use this template"
// instead of overwriting the shared template row. Lookup is intentionally
// not scoped to user_id: templates are curated site-wide (see
// app/api/projects/[id]/template), not personal builds.
//
// ?prompt=<text> is a plain deep-link: prefills the prompt box only, never
// auto-submits (no surprise credit spend) and never touches initialHtml/
// initialProjectId. Used by the "Build on GYSM.IO" links from the Chrome
// extension (and anywhere else that wants to hand off a starting prompt).
export default async function BuilderPage({
  searchParams,
}: {
  searchParams: { projectId?: string; template?: string; prompt?: string; remixSkill?: string; remixPrompt?: string };
}) {
  let initialHtml: string | null = null;
  let initialPrompt = "";
  let initialProjectId: string | null = null;

  const user = await getUser();
  const isAdmin = isAdminEmail(user?.email ?? null);
  // Real identity + balance for the sidebar footer (see
  // LinearBuilderClient.tsx's Sidebar) -- 0 credits for a logged-out
  // visitor is fine, the /sign-in redirect on first generate attempt is
  // the actual gate, not this display value.
  const credits = user ? await getCreditBalance(user.id) : 0;
  // Brand Kit / Style Lock (42-tool spec item 36) -- null for a
  // logged-out visitor or a user who hasn't set one up yet, both of
  // which the composer's "Brand" toggle treats as "nothing to apply".
  // Wrapped in try/catch like every other DB call on this page --
  // HOTFIX: this was missing the guard and took down all of /builder
  // for every signed-in user when db/migrations/0016_brand_kits.sql
  // hadn't been run yet (NeonDbError: relation "brand_kits" does not
  // exist). A missing/late migration should degrade this one feature,
  // not the whole builder page.
  let brandKit: Awaited<ReturnType<typeof getBrandKit>> = null;
  if (user) {
    try {
      brandKit = await getBrandKit(user.id);
    } catch (error: any) {
      console.error("[builder] failed to load brand kit (has db/migrations/0016_brand_kits.sql been run?):", error.message);
    }
  }

  const projectId = searchParams?.projectId;
  const templateId = searchParams?.template;

  if (projectId && user) {
    try {
      const rows = await sql`
        select id, prompt, html from projects
        where id = ${projectId} and user_id = ${user.id}
        limit 1
      `;
      const project = rows[0] as any;
      if (project) {
        initialHtml = project.html;
        initialPrompt = project.prompt;
        initialProjectId = project.id;
      }
    } catch (error: any) {
      console.error("[builder] failed to load project for resume:", error.message);
    }
  } else if (templateId) {
    try {
      const rows = await sql`
        select id, prompt, html from projects
        where id = ${templateId} and is_template = true
        limit 1
      `;
      const template = rows[0] as any;
      if (template) {
        initialHtml = template.html;
        initialPrompt = template.prompt;
        // initialProjectId intentionally left null -- see comment above.
      }
    } catch (error: any) {
      console.error("[builder] failed to load template:", error.message);
    }
  } else if (searchParams?.prompt) {
    initialPrompt = searchParams.prompt;
  } else if (searchParams?.remixPrompt) {
    // From Flow TV's Remix button (see app/flow-tv/FlowTvCard.tsx) --
    // prefills both the prompt text and which Media Factory skill is
    // pre-selected, same "never auto-submit" rule as ?prompt= above.
    initialPrompt = searchParams.remixPrompt;
  }
  const initialMediaSkillId = searchParams?.remixPrompt ? searchParams?.remixSkill : undefined;

  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <LinearBuilderClient
        initialHtml={initialHtml}
        initialPrompt={initialPrompt}
        initialProjectId={initialProjectId}
        isAdmin={isAdmin}
        builderPath="/builder"
        userName={user?.name || "there"}
        userEmail={user?.email ?? null}
        userId={user?.id ?? null}
        credits={credits}
        initialBrandKit={brandKit}
        initialMediaSkillId={initialMediaSkillId}
      />
    </div>
  );
}
