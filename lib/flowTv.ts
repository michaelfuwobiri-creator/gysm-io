import { sql } from "@/lib/db";

// Flow TV / Community Gallery (42-tool spec, layer 2, item 11) -- server
// helpers for app/flow-tv/page.tsx and app/api/media/[id]/publish/route.ts.
// See db/migrations/0018_media_generations_public.sql for the schema.

export interface FlowTvItem {
  id: string;
  kind: string;
  outputUrl: string;
  publisherName: string | null;
  publishedAt: string;
  prompt: string | null;
}

// captions/script are text-shaped output (no real image/video/audio to
// show in a visual gallery) -- excluded here, not in the DB constraint,
// so that decision stays easy to revisit without a migration.
const GALLERY_KINDS = ["image", "video", "avatar", "music", "reframe", "video-upscale", "edit", "tts", "voice-clone", "sound-effect", "voice-enhance"];

export async function listPublicGenerations(): Promise<FlowTvItem[]> {
  const rows = await sql`
    select id, kind, output_url, publisher_name, published_at, input
    from media_generations
    where is_public = true and status = 'done' and kind = any(${GALLERY_KINDS})
    order by published_at desc
    limit 100
  `;
  return (rows as any[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    outputUrl: r.output_url,
    publisherName: r.publisher_name,
    publishedAt: r.published_at,
    prompt: (r.input && (r.input.prompt || r.input.topic)) || null,
  }));
}

export async function publishGeneration(userId: string, id: string, publisherName: string | null): Promise<boolean> {
  const rows = await sql`
    update media_generations
    set is_public = true, publisher_name = ${publisherName}, published_at = now()
    where id = ${id} and user_id = ${userId} and status = 'done'
    returning id
  `;
  return rows.length > 0;
}

export async function unpublishGeneration(userId: string, id: string): Promise<void> {
  await sql`update media_generations set is_public = false where id = ${id} and user_id = ${userId}`;
}
