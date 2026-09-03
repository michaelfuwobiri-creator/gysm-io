// Shared types for the VOIIE dashboard, its API routes, and lib/voiie/*.
// `answers` is a loose JSON blob in Postgres (voiie_consultations.answers)
// but a structured, per-question map here in the app.

export type QuestionType = "single" | "multi" | "text" | "domain" | "file" | "contact";

export interface VoiieQuestion {
  key: string;
  short: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  placeholder?: string;
  icons?: Record<string, string>;
}

export interface DomainAnswer {
  status: "first-timer" | "existing";
  domain: string;
}

export interface BusinessAnswer {
  name: string;
  desc: string;
}

export interface AssetsAnswer {
  logoUrl: string | null;
  note: string;
  colors: string;
  theme: string;
}

/** answers[key] shapes, keyed by VOIIE_QUESTIONS[].key */
export interface LeadAnswers {
  appType?: string;
  experience?: DomainAnswer;
  business?: BusinessAnswer;
  goal?: string;
  pages?: string[];
  features?: string[];
  assets?: AssetsAnswer;
  content?: string;
  domain?: string;
  timeline?: string;
  integrations?: string[];
  contact?: string;
  [key: string]: unknown;
}

export type LeadStatus =
  | "new"
  | "contacted"
  | "replied"
  | "consulting"
  | "demo_sent"
  | "viewed"
  | "negotiating"
  | "paid"
  | "converted"
  | "deployed"
  | "lost";

export type CustomerStatus = "active" | "renewal_due" | "churned";
export type RenewalType = "domain" | "hosting" | "upgrade" | "repair" | "add_feature";
export type RenewalStatus = "pending" | "sent" | "paid";
export type SupportTicketStatus = "open" | "in_progress" | "resolved";

export type Platform = "twitter" | "threads" | "places" | "manual";
export type OutreachChannel = "twitter" | "whatsapp" | "email";

/** Mirrors the "voiie_*" entries in lib/stripe.ts PRICING_PLANS -- kept in
 *  sync by hand since that file can't import this one (it's imported by
 *  client components, this one isn't meant to be). */
export type VoiiePlanId = "voiie_starter" | "voiie_pro" | "voiie_agency";

export const PLAN_DETAILS: Record<
  VoiiePlanId,
  { label: string; price: number; title: string; items: string[] }
> = {
  voiie_starter: {
    label: "$79",
    price: 79,
    title: "Starter Site",
    items: ["Live hosting on gysm.io", "SSL certificate", "Your own GYSM.IO account", "3 free edit credits"],
  },
  voiie_pro: {
    label: "$199",
    price: 199,
    title: "Pro Site",
    items: ["Everything in Starter", "Custom domain connect", "Priority repairs/upgrades", "10 free edit credits"],
  },
  voiie_agency: {
    label: "$499",
    price: 499,
    title: "Agency Site",
    items: ["Everything in Pro", "Full build-out & hands-on support", "Ongoing renewal management", "30 free edit credits"],
  },
};

export interface VoiieLead {
  id: string;
  owner_user_id: string;
  platform: Platform;
  handle: string;
  display_name: string | null;
  bio: string | null;
  signal: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: LeadStatus;
  demo_project_id: string | null;
  plan_id: VoiiePlanId | null;
  stripe_checkout_session_id: string | null;
  converted_user_id: string | null;
  converted_at: string | null;
  tags: string[];
  do_not_contact: boolean;
  demo_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Hunt-safety controls, one row per operator -- backs the Hunter panel's
 *  "Anti-spam" section for real (daily cap, blacklist, spintax, kill
 *  switch), rather than those toggles being cosmetic. */
export interface VoiieSettings {
  owner_user_id: string;
  daily_hunt_limit: number;
  spintax_enabled: boolean;
  kill_switch: boolean;
  blacklist: string[];
  updated_at: string;
}

/** The renewal-relevant extension of a converted lead -- see
 *  db/migrations/0017_voiie_v2.sql for why this doesn't duplicate
 *  users/projects/subscriptions. */
export interface VoiieCustomer {
  id: string;
  lead_id: string;
  owner_user_id: string;
  converted_user_id: string;
  business_name: string;
  slug: string;
  gysm_subdomain: string;
  custom_domain: string | null;
  plan_id: VoiiePlanId;
  brand_kit: { logoUrl?: string; colors?: string[]; theme?: string };
  status: CustomerStatus;
  expiry_date: string;
  created_at: string;
  updated_at: string;
}

export interface VoiieRenewal {
  id: string;
  customer_id: string;
  type: RenewalType;
  amount_cents: number;
  status: RenewalStatus;
  due_date: string;
  stripe_checkout_session_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface VoiieSupportTicket {
  id: string;
  customer_id: string;
  issue: string;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
}

export interface VoiieMessage {
  id: string;
  lead_id: string;
  direction: "outbound" | "inbound";
  channel: OutreachChannel | "system";
  body: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface VoiieConsultation {
  lead_id: string;
  answers: LeadAnswers;
  current_question: number;
  completed_at: string | null;
}
