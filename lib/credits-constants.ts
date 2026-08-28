// Plain plan/credit constants with NO database dependency.
//
// This file exists separately from lib/credits.ts (which imports lib/db.ts,
// a server-only Postgres client that throws at module-load time if
// DATABASE_URL isn't set) so that client components can safely import plan
// pricing/build data without accidentally pulling the Postgres client into
// the browser bundle. See app/pricing/CheckoutButton.tsx, which imports
// lib/stripe.ts (and therefore these constants) as a "use client" component
// -- if lib/stripe.ts pulled in lib/credits.ts directly, Next.js would bundle
// lib/db.ts's top-level `if (!process.env.DATABASE_URL) throw` into client
// JS, where process.env.DATABASE_URL is always undefined (only NEXT_PUBLIC_*
// vars are ever inlined client-side), breaking checkout for every visitor.
export const CREDIT_COST_PER_BUILD = 500;

// Non-default model tiers ("best" = Sol, "claude" = Claude Sonnet 5, see
// lib/ai/orchestrator.ts) cost more credits than the default Terra tier --
// 2x, matching roughly the real output-token cost gap between the
// default model and either stronger option, rather than an arbitrary
// number. Charged only when a user explicitly opts into one in the
// builder; every existing flow (default generate, public API) keeps
// costing CREDIT_COST_PER_BUILD exactly as it always has.
export const CREDIT_COST_PER_BUILD_BEST = CREDIT_COST_PER_BUILD * 2;

// Builds included per plan per month, and the credit equivalent
// (builds * CREDIT_COST_PER_BUILD). Single source of truth for
// lib/stripe.ts PRICING_PLANS -- change build counts here.
export const BUILDS_PER_PLAN = {
  credits_starter: 5,
  credits_popular: 20,
  credits_bulk: 50,
  plan_builder: 40,
  plan_pro: 150,
  plan_studio: 600,
} as const;

export const CREDITS_PER_PLAN = Object.fromEntries(
  Object.entries(BUILDS_PER_PLAN).map(([id, builds]) => [id, builds * CREDIT_COST_PER_BUILD])
) as Record<keyof typeof BUILDS_PER_PLAN, number>;
