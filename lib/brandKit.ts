import { sql } from "@/lib/db";

// Brand Kit / Style Lock (42-tool spec, layer 6, item 36) -- one row per
// user, fetched server-side alongside getCreditBalance() the same way
// app/builder/page.tsx already does for credits, and read/written via
// GET/PUT /api/brand-kit for the client-side editor panel.

export interface BrandKit {
  name: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFamily: string | null;
  logoUrl: string | null;
}

export async function getBrandKit(userId: string): Promise<BrandKit | null> {
  const rows = await sql`
    select name, primary_color, secondary_color, font_family, logo_url
    from brand_kits
    where user_id = ${userId}
    limit 1
  `;
  const row = rows[0] as any;
  if (!row) return null;
  return {
    name: row.name,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    fontFamily: row.font_family,
    logoUrl: row.logo_url,
  };
}

export async function upsertBrandKit(userId: string, kit: BrandKit): Promise<void> {
  await sql`
    insert into brand_kits (user_id, name, primary_color, secondary_color, font_family, logo_url, updated_at)
    values (${userId}, ${kit.name}, ${kit.primaryColor}, ${kit.secondaryColor}, ${kit.fontFamily}, ${kit.logoUrl}, now())
    on conflict (user_id) do update set
      name = excluded.name,
      primary_color = excluded.primary_color,
      secondary_color = excluded.secondary_color,
      font_family = excluded.font_family,
      logo_url = excluded.logo_url,
      updated_at = now()
  `;
}

// Turns a saved kit into a short, deterministic suffix appended to
// image/video/music prompts when the composer's "Brand" toggle is on
// (see app/builder/LinearBuilderClient.tsx's runMediaGeneration) --
// real prompt-engineering against the real model call, not a cosmetic
// label. Returns "" when the kit has nothing usable set yet, so turning
// the toggle on with an empty kit is a harmless no-op rather than an
// error.
export function brandKitPromptSuffix(kit: BrandKit | null | undefined): string {
  if (!kit) return "";
  const parts: string[] = [];
  if (kit.primaryColor) parts.push(`primary brand color ${kit.primaryColor}`);
  if (kit.secondaryColor) parts.push(`secondary brand color ${kit.secondaryColor}`);
  if (kit.fontFamily) parts.push(`typography in the style of ${kit.fontFamily}`);
  if (kit.name) parts.push(`consistent with the "${kit.name}" brand`);
  if (parts.length === 0) return "";
  return ` -- brand style lock: ${parts.join(", ")}.`;
}
