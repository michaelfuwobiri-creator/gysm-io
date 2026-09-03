import { sql } from "@/lib/db";

// Template System (42-tool spec, layer 6, item 37) -- see
// db/migrations/0019_media_templates.sql for schema/rationale.

export interface MediaTemplate {
  id: string;
  name: string;
  skillId: string;
  prompt: string;
  pickValue: string | null;
}

export async function listTemplates(userId: string): Promise<MediaTemplate[]> {
  const rows = await sql`
    select id, name, skill_id, prompt, pick_value
    from media_templates
    where user_id = ${userId}
    order by created_at desc
  `;
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name, skillId: r.skill_id, prompt: r.prompt, pickValue: r.pick_value }));
}

export async function createTemplate(
  userId: string,
  name: string,
  skillId: string,
  prompt: string,
  pickValue: string | null
): Promise<MediaTemplate> {
  const rows = await sql`
    insert into media_templates (user_id, name, skill_id, prompt, pick_value)
    values (${userId}, ${name}, ${skillId}, ${prompt}, ${pickValue})
    returning id, name, skill_id, prompt, pick_value
  `;
  const r = rows[0] as any;
  return { id: r.id, name: r.name, skillId: r.skill_id, prompt: r.prompt, pickValue: r.pick_value };
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  await sql`delete from media_templates where id = ${id} and user_id = ${userId}`;
}
