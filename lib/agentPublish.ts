import { sql } from "@/lib/db";
import { saveAgentPreview, selectHostableFiles, setPreviewSlug } from "@/lib/agentProjects";
import { previewHostsFor, previewLinkFor, subdomainsEnabled } from "@/lib/previewSlug";
import { HOSTED_MAX_FILES, HOSTED_MAX_TOTAL_BYTES } from "@/lib/projectFilesCore";
import { appFrameUrl } from "@/lib/userContent";
import { ensureProjectDomain, removeDomainFromProject } from "@/lib/vercelDomains";

// Publishing an Agent site on gysm.io: the files are copied into a project row
// and served at <name>.gysm.io (or www.gysm.io/s/<name>). Used by the Preview
// panel's "Get gysm.io link" and by the Agent's deploy tool, so both give the
// same address.

/** How much of a workspace folder is read for publishing (a little over the hosting caps). */
export const PUBLISH_READ_LIMITS = { maxFiles: HOSTED_MAX_FILES * 4, maxBytes: Math.round(HOSTED_MAX_TOTAL_BYTES * 1.2) };

export const SITE_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://www.gysm.io").replace(/\/$/, "");

export type PublishResult =
  | { ok: true; id: string; slug: string | null; url: string; skipped: string[]; note?: string }
  | { ok: false; error: string; status: number; taken?: boolean; id?: string; skipped?: string[] };

export async function publishAgentSite(opts: {
  userId: string;
  project: string;
  files: { path: string; text?: string; base64?: string }[];
  slug?: string;
  origin?: string;
}): Promise<PublishResult> {
  const { userId, project } = opts;
  const origin = (opts.origin || SITE_ORIGIN).replace(/\/$/, "");
  const picked = selectHostableFiles(opts.files);
  if (picked.error) return { ok: false, error: picked.error, status: 422 };

  const id = await saveAgentPreview({ userId, project, files: picked.files });
  const named = await setPreviewSlug({ id, userId, wanted: opts.slug, fallbackFrom: project });
  // Files are saved either way; a bad or taken name is reported so the user can pick another.
  if (named.error && opts.slug) {
    return { ok: false, error: named.error, taken: !!named.taken, status: named.taken ? 409 : 422, id, skipped: picked.skipped };
  }

  let url = named.slug ? previewLinkFor(named.slug, origin) : appFrameUrl(id, "index.html") ?? `${origin}/a/${id}/index.html`;
  let note: string | undefined;
  if (named.slug && subdomainsEnabled()) {
    // Register <name>.gysm.io (and www.<name>.gysm.io -> it) on the Vercel
    // project so each gets a certificate. Already-registered hosts are fine.
    const hosts = previewHostsFor(named.slug);
    try {
      await ensureProjectDomain(hosts.main);
      await ensureProjectDomain(hosts.alias, hosts.main);
      if (named.created) note = "A new name can take a minute to start working while its certificate is issued.";
    } catch (e: any) {
      console.error("[agent] couldn't register site domain:", e?.message || e);
      url = `${origin}/s/${named.slug}`;
      note = "The gysm.io name isn't ready yet, so here is the gysm.io/s/ link. Try again in a minute.";
    }
    if (named.previous && named.previous !== named.slug) {
      const old = previewHostsFor(named.previous);
      await Promise.allSettled([removeDomainFromProject(old.alias), removeDomainFromProject(old.main)]);
    }
  }

  // The dashboard's "View live" link (migration 0034); skipped if not applied.
  try {
    await sql`update projects set live_url = ${url} where id = ${id}`;
  } catch {
    /* live_url column not migrated yet */
  }
  return { ok: true, id, slug: named.slug, url, skipped: picked.skipped, note };
}
