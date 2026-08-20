// Single source of truth for "is this the GYSM.IO admin" -- gates the
// template-curation toggle (see app/api/projects/[id]/template) so only
// Mike can flag a build as a public template. Defaults to Mike's email;
// can be extended via ADMIN_EMAILS (comma-separated) without a redeploy
// if more admins are ever added, but no env var is required for this to
// work today.
const DEFAULT_ADMIN_EMAILS = ["michaelfuwobiri@gmail.com"];

function adminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS;
  if (!fromEnv) return DEFAULT_ADMIN_EMAILS;
  return fromEnv.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
