// "Bring your own accounts" for GYSM Stores: what each service is for, how a
// seller creates the account and project, and which values to copy. Pure: no
// network, no env, so the agent, the dashboard and tests can all use it.

export const STORE_PROVIDERS = ["stripe", "neon", "supabase", "clerk", "shippo"] as const;
export type StoreProvider = (typeof STORE_PROVIDERS)[number];
/** Providers whose keys are pasted and stored (Stripe uses Stripe's own onboarding instead). */
export const KEYED_PROVIDERS = ["neon", "supabase", "clerk", "shippo"] as const;
export type KeyedProvider = (typeof KEYED_PROVIDERS)[number];

export type ProviderGuide = {
  provider: StoreProvider;
  label: string;
  purpose: string;
  required: boolean;
  signupUrl: string;
  steps: string[];
  /** The one value kept secret (typed by the seller, encrypted, never shown again). */
  secretField?: { key: string; label: string; example: string };
  /** A value that is safe to show (a public key or URL). */
  publicField?: { key: string; label: string; example: string };
};

export const PROVIDER_GUIDES: Record<StoreProvider, ProviderGuide> = {
  stripe: {
    provider: "stripe",
    label: "Stripe",
    purpose: "Takes card payments. Money goes straight to the seller's own Stripe account, never through GYSM.",
    required: true,
    signupUrl: "https://dashboard.stripe.com/register",
    steps: [
      "In the store dashboard, press \"Connect Stripe\".",
      "Sign in to Stripe or create an account on Stripe's own page.",
      "Finish Stripe's questions about the business and the bank account for payouts.",
      "Come back to GYSM: the store shows \"Payments ready\" once Stripe enables charges.",
    ],
  },
  neon: {
    provider: "neon",
    label: "Neon (your own database)",
    purpose: "Keeps the store's products and orders in the seller's own Postgres database. Optional: without it GYSM hosts the data.",
    required: false,
    signupUrl: "https://console.neon.tech/signup",
    steps: [
      "Create a free Neon account.",
      "Create a project, choosing the region closest to your customers (for Europe, Frankfurt).",
      "Open the project, press \"Connect\" and copy the connection string (it starts with postgresql:// and ends in neon.tech/...).",
      "Paste it into GYSM. GYSM checks it, creates the store tables in your database and moves the store onto it.",
      "Connect it before adding products: a store that already has products here stays on GYSM's database.",
    ],
    secretField: { key: "connectionString", label: "Neon connection string", example: "postgresql://user:password@ep-example-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require" },
  },
  supabase: {
    provider: "supabase",
    label: "Supabase",
    purpose: "An alternative to Neon for the seller's own database, with sign-in and file storage built in.",
    required: false,
    signupUrl: "https://supabase.com/dashboard/sign-up",
    steps: [
      "Create a free Supabase account and a new project.",
      "Open Project Settings, then API.",
      "Copy the Project URL (https://<ref>.supabase.co) and the service_role key.",
      "Paste both into GYSM. The service_role key is kept encrypted and never shown again.",
    ],
    publicField: { key: "projectUrl", label: "Supabase project URL", example: "https://abcdefghijklmnopqrst.supabase.co" },
    secretField: { key: "serviceRoleKey", label: "Supabase service_role key", example: "eyJhbGciOi..." },
  },
  clerk: {
    provider: "clerk",
    label: "Clerk",
    purpose: "Customer accounts and sign-in for the store, on the seller's own Clerk application.",
    required: false,
    signupUrl: "https://dashboard.clerk.com/sign-up",
    steps: [
      "Create a free Clerk account and a new application, choosing the sign-in methods you want (email, Google, ...).",
      "Open Configure, then API keys.",
      "Copy the Publishable key (pk_...) and the Secret key (sk_...).",
      "Paste both into GYSM. Use test keys while trying things out, live keys when you open the store.",
    ],
    publicField: { key: "publishableKey", label: "Clerk publishable key", example: "pk_test_..." },
    secretField: { key: "secretKey", label: "Clerk secret key", example: "sk_test_..." },
  },
  shippo: {
    provider: "shippo",
    label: "Shippo (shipping)",
    purpose: "Shipping rates, labels and tracking for physical products.",
    required: false,
    signupUrl: "https://apps.goshippo.com/join",
    steps: [
      "Create a Shippo account.",
      "Open Settings, then API, and generate a test token first (shippo_test_...).",
      "Paste it into GYSM. Switch to the live token (shippo_live_...) when you start shipping real parcels.",
      "Check that the carriers you need in your country are available in Shippo.",
    ],
    secretField: { key: "apiToken", label: "Shippo API token", example: "shippo_test_..." },
  },
};

export function isStoreProvider(v: unknown): v is StoreProvider {
  return typeof v === "string" && (STORE_PROVIDERS as readonly string[]).includes(v);
}

export function isKeyedProvider(v: unknown): v is KeyedProvider {
  return typeof v === "string" && (KEYED_PROVIDERS as readonly string[]).includes(v);
}

export type CleanKeys = { publicConfig: Record<string, string>; secret: string };

/**
 * Checks the shape of what the seller pasted before anything is sent anywhere.
 * Hosts are pinned to the provider's own domain, so a pasted value can never
 * make GYSM call an arbitrary server.
 */
export function cleanProviderKeys(provider: KeyedProvider, publicValue: unknown, secretValue: unknown): { ok: true; value: CleanKeys } | { ok: false; error: string } {
  const secret = typeof secretValue === "string" ? secretValue.trim() : "";
  const pub = typeof publicValue === "string" ? publicValue.trim() : "";
  if (!secret) return { ok: false, error: `Paste the ${PROVIDER_GUIDES[provider].secretField!.label}.` };
  if (secret.length > 2000) return { ok: false, error: "That value is too long." };
  switch (provider) {
    case "neon": {
      let u: URL;
      try {
        u = new URL(secret);
      } catch {
        return { ok: false, error: "That isn't a connection string. It should start with postgresql://." };
      }
      if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") return { ok: false, error: "The connection string should start with postgresql://." };
      if (!u.hostname.endsWith(".neon.tech")) return { ok: false, error: "That isn't a Neon connection string (the host should end in neon.tech)." };
      if (!u.username || !u.password) return { ok: false, error: "The connection string is missing the user or password. Copy it again from Neon's Connect panel." };
      return { ok: true, value: { publicConfig: { host: u.hostname, database: u.pathname.replace(/^\//, "") || "neondb" }, secret } };
    }
    case "supabase": {
      const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(pub);
      if (!m) return { ok: false, error: "The project URL should look like https://abcdefghijklmnopqrst.supabase.co." };
      if (!/^[A-Za-z0-9._-]{20,}$/.test(secret)) return { ok: false, error: "That doesn't look like a Supabase service_role key." };
      return { ok: true, value: { publicConfig: { projectUrl: `https://${m[1]}.supabase.co`, ref: m[1] }, secret } };
    }
    case "clerk": {
      const pk = /^pk_(test|live)_[A-Za-z0-9+/=_-]{10,}$/.exec(pub);
      const sk = /^sk_(test|live)_[A-Za-z0-9]{10,}$/.exec(secret);
      if (!pk) return { ok: false, error: "The publishable key should start with pk_test_ or pk_live_." };
      if (!sk) return { ok: false, error: "The secret key should start with sk_test_ or sk_live_." };
      if (pk[1] !== sk[1]) return { ok: false, error: "One key is a test key and the other is live. Copy both from the same Clerk environment." };
      return { ok: true, value: { publicConfig: { publishableKey: pub, mode: pk[1] }, secret } };
    }
    case "shippo": {
      const t = /^shippo_(test|live)_[A-Za-z0-9]{10,}$/.exec(secret);
      if (!t) return { ok: false, error: "The token should start with shippo_test_ or shippo_live_." };
      return { ok: true, value: { publicConfig: { mode: t[1] }, secret } };
    }
  }
}

/** Plain-text guide the agent reads before advising a seller. */
export function setupGuideText(providers: StoreProvider[] = [...STORE_PROVIDERS]): string {
  return providers
    .map((p) => {
      const g = PROVIDER_GUIDES[p];
      const fields = [g.publicField && `public value "${g.publicField.key}" (${g.publicField.label})`, g.secretField && `secret typed by the seller (${g.secretField.label})`]
        .filter(Boolean)
        .join("; ");
      return [
        `## ${g.label}${g.required ? " (required to sell)" : " (optional)"}`,
        g.purpose,
        `Sign up: ${g.signupUrl}`,
        ...g.steps.map((s, i) => `${i + 1}. ${s}`),
        p === "stripe" ? "Connect: the seller presses Connect Stripe in the store dashboard (no keys to paste)." : `Connect with store_connect: ${fields}.`,
      ].join("\n");
    })
    .join("\n\n");
}
