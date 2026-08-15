import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

// Per-app installable-PWA manifest for a published build, so "Orbit" (or
// any future published app) can be added to a user's home screen as its
// own app -- distinct icon and name -- rather than only as a bookmark
// inside GYSM.IO. Falls back to GYSM.IO's own icon set for any published
// app that doesn't have a custom-designed icon (currently only Orbit
// does, at /icons/orbit/*).
const CUSTOM_ICON_PROJECTS: Record<string, string> = {
  "5b983815-8702-4bde-b4d6-712ae95d95c0": "/icons/orbit",
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let title = "GYSM App";
  try {
    const rows = await sql`select title, prompt from projects where id = ${params.id} and is_public = true limit 1`;
    const project = rows[0] as any;
    if (project) title = project.title || project.prompt || title;
  } catch {
    // Fall through to defaults -- a broken manifest shouldn't break the page.
  }

  const iconBase = CUSTOM_ICON_PROJECTS[params.id] || "/icons";

  const manifest = {
    name: title,
    short_name: title.length > 20 ? title.slice(0, 20) : title,
    description: `${title} — built with GYSM.IO`,
    start_url: `/publish/${params.id}?source=pwa`,
    scope: `/publish/${params.id}`,
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: `${iconBase}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${iconBase}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${iconBase}/icon-maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${iconBase}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
