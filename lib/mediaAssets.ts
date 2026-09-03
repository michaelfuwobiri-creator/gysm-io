import { sql } from "@/lib/db";

// Asset Management / "Ingredients" (42-tool spec, layer 2, item 10) --
// see db/migrations/0017_media_assets.sql for the schema/rationale.

export const ASSET_CATEGORIES = ["cast", "setting", "object"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface MediaAsset {
  id: string;
  category: AssetCategory;
  name: string;
  referenceImageUrl: string;
}

export async function listAssets(userId: string): Promise<MediaAsset[]> {
  const rows = await sql`
    select id, category, name, reference_image_url
    from media_assets
    where user_id = ${userId}
    order by created_at desc
  `;
  return (rows as any[]).map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    referenceImageUrl: r.reference_image_url,
  }));
}

export async function createAsset(
  userId: string,
  category: AssetCategory,
  name: string,
  referenceImageUrl: string
): Promise<MediaAsset> {
  const rows = await sql`
    insert into media_assets (user_id, category, name, reference_image_url)
    values (${userId}, ${category}, ${name}, ${referenceImageUrl})
    returning id, category, name, reference_image_url
  `;
  const r = rows[0] as any;
  return { id: r.id, category: r.category, name: r.name, referenceImageUrl: r.reference_image_url };
}

export async function deleteAsset(userId: string, id: string): Promise<void> {
  await sql`delete from media_assets where id = ${id} and user_id = ${userId}`;
}
