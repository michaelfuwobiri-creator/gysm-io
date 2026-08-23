import { NextRequest } from "next/server";
import JSZip from "jszip";
import { getUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// "Voiie" -- one-click "deploy this build to your own Vercel account"
// export. GYSM already has a working single-file .html download (see the
// sibling /download route) and a working Vercel API integration for
// custom domains (lib/vercelDomains.ts, using GYSM's own VERCEL_API_TOKEN
// against GYSM's own project). This is deliberately NOT the same kind of
// integration: attaching a domain to *our* Vercel project is safe to do
// with our own token, but deploying to a *user's* Vercel account would
// require a real Vercel OAuth Integration (their app review process,
// storing per-user access tokens, etc.) -- meaningfully more
// infrastructure than exists today, and not something to fake.
//
// Instead this packages the build as a folder Vercel's own "New Project"
// page already knows how to deploy with zero auth from us: drag a folder
// containing an index.html onto vercel.com/new and Vercel deploys it
// straight to *your* account. That's a real, first-party Vercel feature,
// not a GYSM integration -- we're just handing back a folder shaped the
// way Vercel expects one, plus a plain-language nudge on where to drop it.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    const rows = await sql`
      select html, name, prompt from projects
      where id = ${params.id} and (user_id = ${user.id} or (org_id is not null and org_id = ${user.orgId}))
      limit 1
    `;
    const project = rows[0] as any;
    if (!project) {
      return Response.json({ error: "Build not found." }, { status: 404 });
    }

    const displayName = (project.name || project.prompt || "GYSM app").toString().slice(0, 80);
    const base =
      displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-+|-+$)/g, "")
        .slice(0, 60) || "gysm-app";

    const zip = new JSZip();
    // Must be literally named index.html -- that's what Vercel's static
    // deploy (and every static host) looks for as the folder's entry
    // point.
    zip.file("index.html", project.html);
    // Empty-but-valid config. Nothing in a single static HTML file needs
    // routing/build overrides, but shipping the file makes it explicit
    // this is meant for Vercel and gives the user a place to add their
    // own settings later (custom headers, redirects, etc.) without
    // guessing the schema.
    zip.file("vercel.json", JSON.stringify({ cleanUrls: true }, null, 2) + "\n");
    zip.file(
      "README.md",
      [
        `# ${displayName}`,
        "",
        "Exported from GYSM.IO for deploying to your own Vercel account.",
        "",
        "## Deploy",
        "",
        "1. Unzip this folder.",
        "2. Go to https://vercel.com/new",
        "3. Drag the unzipped folder onto the page (or use \"Deploy\" → upload folder).",
        "",
        "Vercel deploys it straight to your own account -- GYSM never sees your Vercel login.",
        "",
        `Originally built at: ${process.env.NEXT_PUBLIC_SITE_URL || "https://www.gysm.io"}/builder`,
      ].join("\n")
    );

    const buffer = await zip.generateAsync({ type: "uint8array" });

    // Cast: Node's Uint8Array types its underlying buffer as the broader
    // ArrayBufferLike (it can back a SharedArrayBuffer), while lib.dom's
    // BodyInit wants the narrower plain ArrayBuffer -- a real TS structural
    // gap between Node and DOM lib types, not a runtime issue. Response
    // has always accepted a Uint8Array body at runtime.
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}-vercel.zip"`,
      },
    });
  } catch (error: any) {
    console.error("[projects] failed to build Vercel export:", error.message);
    return Response.json({ error: "Failed to build export. Please try again." }, { status: 500 });
  }
}
