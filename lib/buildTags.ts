// Shared category list for BuildGuild -- used at publish time (the tag
// picker in PublishButton.tsx and the builder's inline publish panel in
// LinearBuilderClient.tsx) and at browse time (the filter chips on
// /buildguild). A fixed whitelist, not freeform tags: keeps the filter
// chips meaningful (no typo'd near-duplicates like "SaaS" / "Saas" /
// "saas app" all splitting the same handful of builds) and lets the
// publish API route validate server-side instead of trusting client input.
export const BUILD_TAGS = [
  "SaaS",
  "AI Tool",
  "E-commerce",
  "Portfolio",
  "Dashboard",
  "Landing Page",
  "Mobile App",
  "Game",
  "Community",
  "Other",
] as const;

export type BuildTag = (typeof BUILD_TAGS)[number];

export const MAX_TAGS_PER_BUILD = 3;

export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set<string>(BUILD_TAGS as readonly string[]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (valid.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (out.length >= MAX_TAGS_PER_BUILD) break;
  }
  return out;
}

// Neon's sql`` tag doesn't document JS-array-to-pg-array param coercion,
// so tags are written via an explicit text[] literal + cast instead of
// relying on that. Postgres array literal escaping: wrap each element in
// double quotes, escape backslashes then double quotes inside it.
export function toPgTextArrayLiteral(values: string[]): string {
  const escaped = values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
}
