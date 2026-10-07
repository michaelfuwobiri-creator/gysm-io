// Comparison data for /alternatives/[slug] and /best-ai-app-builder.
//
// Every competitor fact below was read from that product's own official
// pricing or plans page on CHECKED_ON (see `sources`). It records only what
// those pages listed: a feature that is not listed here may still exist, and
// prices change often. When updating, re-open the source pages, change the
// facts and bump CHECKED_ON. Do not add a claim you have not seen on a
// source page.

export const CHECKED_ON = "7 October 2026";

export type Rival = {
  slug: string;
  name: string;
  /** Full alternatives page exists for this rival. */
  page: boolean;
  sources: { label: string; url: string }[];
  pricing: string;
  allowance: string;
  listed: string[];
  chooseRival: string[];
};

export const RIVALS: Rival[] = [
  {
    slug: "lovable",
    name: "Lovable",
    page: true,
    sources: [{ label: "Lovable subscription plans", url: "https://docs.lovable.dev/introduction/subscription-plans" }],
    pricing: "Free; Pro from $25/month; Business from $50/month; Enterprise custom",
    allowance: "Free: 30 credits a month (5 a day). Paid plans: 100 to 10,000 credits a month by tier",
    listed: [
      "Git sync on every plan",
      "Code editing and download, custom domains and user roles (Pro)",
      "SSO, a Lovable API and a security center (Business)",
      "SCIM, audit logs and EU inference (Enterprise)",
    ],
    chooseRival: [
      "You want to edit the generated code inside the product, with git sync on every plan.",
      "You need SSO or a security center on a paid tier today.",
    ],
  },
  {
    slug: "bolt",
    name: "Bolt",
    page: true,
    sources: [{ label: "Bolt pricing", url: "https://bolt.new/pricing" }],
    pricing: "Free; Pro $25/month; Teams $30 per member per month; Enterprise custom",
    allowance: "Free: 300,000 tokens a day and 1,000,000 a month. Pro: from 10,000,000 tokens a month, with rollover",
    listed: [
      "Hosting, databases and custom domains (Pro)",
      "SEO boosting, private NPM registries and design-system knowledge (Teams)",
      "SSO and audit logs (Enterprise)",
    ],
    chooseRival: [
      "You want hosting and a database bundled into the same subscription.",
      "You are buying for a team and want per-seat Teams billing.",
    ],
  },
  {
    slug: "replit",
    name: "Replit",
    page: true,
    sources: [{ label: "Replit pricing", url: "https://replit.com/pricing" }],
    pricing: "Core $20/month ($18 billed annually); Pro $100/month ($90 billed annually); Enterprise custom",
    allowance: "Core: $20 of usage toward more powerful models. Pro: $100 toward the most powerful models",
    listed: [
      "Up to 60 projects on Free Mode",
      "10 parallel agents and up to 15 collaborators (Pro)",
      "Database rollback up to 28 days (Pro)",
      "SSO/SAML and single-tenant hosting (Enterprise)",
    ],
    chooseRival: [
      "You want an in-browser development environment with parallel agents.",
      "You need real-time collaborators on the same project.",
    ],
  },
  {
    slug: "v0",
    name: "v0 (Vercel)",
    page: false,
    sources: [{ label: "v0 pricing", url: "https://v0.app/pricing" }],
    pricing: "Free; Plus $30/month; Business $100 per user per month; Enterprise custom",
    allowance: "Free: 7 messages a day. Plus and Business: $30 of monthly credits per user plus $2 of daily login credits",
    listed: ["Deploy to Vercel, Design Mode and GitHub sync", "Team collaboration", "SAML SSO and RBAC (Enterprise)"],
    chooseRival: [],
  },
  {
    slug: "base44",
    name: "Base44",
    page: false,
    sources: [{ label: "Base44 pricing", url: "https://base44.com/pricing" }],
    pricing: "Free; Starter $16/month; Builder $40/month; Pro $80/month; Elite $160/month (billed annually, 20% off)",
    allowance: "Free: 25 message credits and 100 integration credits a month. Elite: 1,200 and 50,000",
    listed: [
      "Auth and a database on the Free plan, up to 5 apps",
      "Unlimited apps, a custom domain and a free domain for a year (Starter and up)",
      "GitHub integration (Builder and up)",
    ],
    chooseRival: [],
  },
];

export function getRival(slug: string): Rival | undefined {
  return RIVALS.find((r) => r.slug === slug && r.page);
}

/** What GYSM does, as the product and its code stand today. Keep this honest:
 *  the gaps are stated on purpose, because people and AI assistants trust a
 *  comparison that names them. */
export const GYSM_FACTS = {
  output:
    "One complete, self-contained web page per build, with a live preview, a code view you can copy, a downloadable project folder and a public share link",
  codeExport: "Download the project, or connect GitHub and push to it",
  backend: "Connect your own Supabase project and run the generated database schema against it",
  hosting: "Publish to a public page, install it as a web app, or attach your own custom domain",
  teams: "Organizations, API keys, a public generation API and an audit log",
  extras: "A sandboxed AI shell, a media factory, a template marketplace and BuildGuild, a public gallery of published apps",
  limits: [
    "Each build is a single HTML page, not a multi-file project, and there is no in-product multi-file code editor yet.",
    "Git sync is push-only: edits made on GitHub are not pulled back in.",
    "There is no managed database or auth: you connect a Supabase project of your own.",
  ],
};
