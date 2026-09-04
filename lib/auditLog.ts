import { sql } from "@/lib/db";

// Generic audit trail for admin/destructive actions -- item #9 of
// GYSM_IO_HANDOFF.md ("add audit log table"). Best-effort and
// fire-and-forget by design: a logging failure must never be the reason a
// real request (a delete, a curation change) fails, so every call site
// awaits this but this function itself swallows and logs its own errors
// rather than throwing -- same "optional, degrade gracefully" shape used
// throughout this app for non-critical side effects (see lib/email/send.tsx).
export async function logAudit(params: {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await sql`
      insert into audit_log (actor_user_id, action, target_type, target_id, metadata)
      values (
        ${params.actorUserId},
        ${params.action},
        ${params.targetType ?? null},
        ${params.targetId ?? null},
        ${params.metadata ? JSON.stringify(params.metadata) : null}
      )
    `;
  } catch (error: any) {
    console.error("[auditLog] failed to write entry:", error.message, params);
  }
}
