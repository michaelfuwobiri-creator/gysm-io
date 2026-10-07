// Exposed-secret scan for generated apps. A generated build is a single
// public HTML page (anyone can "View source"), so any private key pasted
// into it -- by the model copying something from the prompt, or by the user
// pasting a key into their request -- is public the moment it's published.
//
// Dependency-free and pure so it can run in the preflight check, on demand,
// and in unit tests. Findings never contain the full secret: results are
// persisted (projects.check_results) and shown in the UI, so only a short
// redacted preview is kept.

export type SecretFinding = {
  kind: string;
  label: string;
  severity: "high" | "review";
  preview: string;
  count: number;
};

type Rule = {
  kind: string;
  label: string;
  severity: "high" | "review";
  re: RegExp;
  /** Return false to ignore a match (placeholders, intentionally public keys). */
  accept?: (match: string) => boolean;
};

const PLACEHOLDER_RE = /(your|example|placeholder|changeme|xxxx|\*{4,}|<[^>]+>|\.{3})/i;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const RULES: Rule[] = [
  {
    kind: "anthropic_key",
    label: "Anthropic API key",
    severity: "high",
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
  },
  {
    kind: "openai_key",
    label: "OpenAI API key",
    severity: "high",
    re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g,
    accept: (m) => !m.startsWith("sk-ant-") && !PLACEHOLDER_RE.test(m),
  },
  {
    kind: "stripe_secret",
    label: "Stripe secret or restricted key",
    severity: "high",
    re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  },
  {
    kind: "stripe_webhook",
    label: "Stripe webhook signing secret",
    severity: "high",
    re: /\bwhsec_[A-Za-z0-9]{16,}/g,
  },
  {
    kind: "aws_access_key",
    label: "AWS access key ID",
    severity: "high",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    kind: "github_token",
    label: "GitHub token",
    severity: "high",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g,
  },
  {
    kind: "slack_token",
    label: "Slack token",
    severity: "high",
    re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  },
  {
    kind: "private_key",
    label: "Private key block",
    severity: "high",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    kind: "supabase_service_role",
    label: "Supabase service_role key (bypasses row-level security)",
    severity: "high",
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    // The anon key is meant to be public and is embedded on purpose when a
    // Supabase project is connected; only the service_role key is a leak.
    accept: (m) => decodeJwtPayload(m)?.role === "service_role",
  },
  {
    kind: "google_api_key",
    label: "Google API key (fine if restricted to your domain)",
    severity: "review",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    kind: "generic_secret",
    label: "Hard-coded secret, token or password",
    severity: "review",
    re: /\b(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|password|passwd)\b["']?\s*[:=]\s*["']([A-Za-z0-9_\-./+=]{20,})["']/gi,
    accept: (m) => {
      const value = m.replace(/^[^"']*["']/, "").replace(/["']$/, "");
      // Publishable / public identifiers and obvious placeholders are fine.
      return !/^(pk_|sb_publishable_|eyJ)/.test(value) && !PLACEHOLDER_RE.test(value);
    },
  },
];

function redact(secret: string): string {
  if (secret.length <= 10) return `${secret.slice(0, 2)}...`;
  return `${secret.slice(0, 6)}...${secret.slice(-2)}`;
}

export function scanForSecrets(html: string): SecretFinding[] {
  const found = new Map<string, SecretFinding>();
  const claimed: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => claimed.some(([a, b]) => s < b && e > a);

  for (const rule of RULES) {
    for (const m of Array.from(html.matchAll(rule.re))) {
      const text = m[0];
      const start = m.index ?? 0;
      const end = start + text.length;
      if (overlaps(start, end)) continue; // already reported by a more specific rule
      if (rule.accept && !rule.accept(text)) continue;
      claimed.push([start, end]);

      const key = `${rule.kind}:${text}`;
      const existing = found.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const secret = rule.kind === "generic_secret" && m[1] ? m[1] : text;
        found.set(key, {
          kind: rule.kind,
          label: rule.label,
          severity: rule.severity,
          preview: rule.kind === "private_key" ? "-----BEGIN ... PRIVATE KEY-----" : redact(secret),
          count: 1,
        });
      }
    }
  }
  return Array.from(found.values()).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
